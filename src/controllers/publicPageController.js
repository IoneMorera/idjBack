const supabase = require('../database');
const { uploadPageImage, saveToDisk } = require('../utils/profilePhoto');
const { FIXED_PAGES } = require('../data/fixedPages');

const BLOCK_TYPES = new Set([
  'banner',
  'texto',
  'textoImagen',
  'iconos',
  'precios',
  'alternados',
  'faq',
  'inscripcion',
  'contacto',
  'video',
  'galeria',
  'cartel',
]);

const ICONS = new Set([
  'hotel', 'bed', 'utensils', 'badgeCheck', 'goal', 'tag', 'clock', 'mapPin', 'calendar',
  'gamepad', 'dices', 'users', 'euro', 'car', 'wifi', 'coffee', 'gift', 'star', 'heart', 'party',
]);

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const LIST_COLUMNS = 'id, event_id, title, slug, route_path, published, created_at, updated_at';

function schemaErrorMessage(error, fallback) {
  const message = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`;
  if (/route_path/i.test(message)) {
    return 'Falta aplicar la migración 013_fixed_pages.sql en Supabase';
  }
  if (/public_pages|does not exist|schema cache|Could not find/i.test(message)) {
    return 'Falta aplicar la migración 012_public_pages.sql en Supabase';
  }
  if (/duplicate key|public_pages_slug_key/i.test(message)) {
    return 'Esa dirección ya la usa otra página';
  }
  return fallback;
}

function text(value, max) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

function list(value, max) {
  return Array.isArray(value) ? value.slice(0, max) : [];
}

function keepId(value) {
  if (typeof value === 'string' && /^[a-zA-Z0-9_-]{1,40}$/.test(value)) return value;
  return `id-${Math.random().toString(36).slice(2, 10)}`;
}

function safeUrl(value) {
  const url = text(value, 600);
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('#')) return SLUG_RE.test(url.slice(1)) ? url : null;
  if (url.startsWith('/') && !url.startsWith('//')) return url;
  return null;
}

function invalid(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function sanitizeItem(raw) {
  const item = raw && typeof raw === 'object' ? raw : {};
  const image = safeUrl(item.image);
  if (image === null) throw invalid('Una imagen no es válida. Usa una ruta que empiece por / o una URL http(s)');
  return {
    id: keepId(item.id),
    badge: text(item.badge, 80),
    icon: ICONS.has(item.icon) ? item.icon : 'star',
    title: text(item.title, 300),
    price: text(item.price, 80),
    text: text(item.text, 3000),
    image,
    media: item.media === 'video' ? 'video' : 'image',
  };
}

function sanitizePiece(raw) {
  const piece = raw && typeof raw === 'object' ? raw : {};
  return {
    id: keepId(piece.id),
    kind: piece.kind === 'lista' ? 'lista' : 'parrafo',
    intro: text(piece.intro, 500),
    text: text(piece.text, 4000),
    outro: text(piece.outro, 2000),
  };
}

function sanitizeBlocks(rawBlocks) {
  const anchors = new Set();
  return list(rawBlocks, 40).map((raw) => {
    const block = raw && typeof raw === 'object' ? raw : {};
    if (!BLOCK_TYPES.has(block.type)) throw invalid('Hay un bloque de un tipo que no existe');

    const anchor = text(block.anchor, 60).toLowerCase();
    if (anchor && !SLUG_RE.test(anchor)) {
      throw invalid('El ancla de un bloque solo puede llevar minúsculas, números y guiones');
    }
    if (anchor && anchors.has(anchor)) throw invalid(`El ancla «${anchor}» está repetida`);
    if (anchor) anchors.add(anchor);

    const image = safeUrl(block.image);
    const url = safeUrl(block.url);
    if (image === null || url === null) {
      throw invalid('Una imagen o un enlace no es válido. Usa una ruta que empiece por /, #ancla o una URL http(s)');
    }

    return {
      id: keepId(block.id),
      type: block.type,
      anchor,
      menuLabel: anchor ? text(block.menuLabel, 60) : '',
      label: text(block.label, 120),
      title: text(block.title, 200),
      highlight: text(block.highlight, 200),
      subtitle: text(block.subtitle, 600),
      body: text(block.body, 6000),
      image,
      alt: text(block.alt, 200),
      url,
      buttonLabel: text(block.buttonLabel, 120),
      email: text(block.email, 200),
      size: block.size === 'mediano' ? 'mediano' : 'grande',
      imageEffect: block.imageEffect === 'gris' ? 'gris' : 'ninguno',
      pieces: list(block.pieces, 20).map(sanitizePiece),
      items: list(block.items, 40).map(sanitizeItem),
    };
  });
}

function sanitizePage(body, { partial = false } = {}) {
  const source = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const patch = {};

  if (!partial || 'title' in source) {
    const title = text(source.title, 160);
    if (!title) throw invalid('La página necesita un título');
    patch.title = title;
  }
  if (!partial || 'slug' in source) {
    const slug = text(source.slug, 80).toLowerCase();
    if (!SLUG_RE.test(slug)) throw invalid('La dirección solo puede llevar minúsculas, números y guiones');
    patch.slug = slug;
  }
  if ('event_id' in source) {
    if (source.event_id === null || source.event_id === '') {
      patch.event_id = null;
    } else {
      const eventId = Number(source.event_id);
      if (!Number.isInteger(eventId) || eventId < 1) throw invalid('El evento no es válido');
      patch.event_id = eventId;
    }
  }
  if ('published' in source) {
    if (typeof source.published !== 'boolean') throw invalid('Publicar tiene que ser sí o no');
    patch.published = source.published;
  }
  if ('blocks' in source) patch.blocks = sanitizeBlocks(source.blocks);
  return patch;
}

function sendError(res, error, fallback) {
  if (error?.status === 400) return res.status(400).json({ message: error.message });
  console.error(fallback, error);
  const message = schemaErrorMessage(error, fallback);
  return res.status(/ya la usa/.test(message) ? 400 : 500).json({ message });
}

async function ensureFixedPages() {
  const { data: existing, error } = await supabase
    .from('public_pages')
    .select('route_path')
    .not('route_path', 'is', null);
  if (error) throw error;
  const present = new Set((existing || []).map((row) => row.route_path));

  for (const fixed of FIXED_PAGES) {
    if (present.has(fixed.route_path)) continue;
    const row = {
      route_path: fixed.route_path,
      slug: fixed.slug,
      title: fixed.title,
      published: false,
      blocks: sanitizeBlocks(fixed.build()),
    };
    let { error: insertError } = await supabase.from('public_pages').insert(row);
    if (insertError && /public_pages_slug_key/i.test(`${insertError.message} ${insertError.details || ''}`)) {
      ({ error: insertError } = await supabase.from('public_pages').insert({ ...row, slug: `${fixed.slug}-fija` }));
    }
    if (insertError && !/public_pages_route_path_key/i.test(`${insertError.message} ${insertError.details || ''}`)) {
      throw insertError;
    }
  }
}

exports.listPages = async (req, res) => {
  try {
    await ensureFixedPages();
    const { data, error } = await supabase
      .from('public_pages')
      .select(LIST_COLUMNS)
      .order('created_at', { ascending: true });
    if (error) throw error;
    res.json({ pages: data || [] });
  } catch (error) {
    sendError(res, error, 'Error al cargar las páginas');
  }
};

exports.getPage = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('public_pages')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ message: 'Página no encontrada' });
    res.json({ page: { ...data, blocks: sanitizeBlocks(data.blocks) } });
  } catch (error) {
    sendError(res, error, 'Error al cargar la página');
  }
};

exports.createPage = async (req, res) => {
  try {
    const row = sanitizePage(req.body);
    row.published = false;
    if (!row.blocks) row.blocks = [];
    const { data, error } = await supabase.from('public_pages').insert(row).select('*').single();
    if (error) throw error;
    res.status(201).json({ message: 'Página creada', page: data });
  } catch (error) {
    sendError(res, error, 'Error al crear la página');
  }
};

exports.updatePage = async (req, res) => {
  try {
    const patch = sanitizePage(req.body, { partial: true });
    if (Object.keys(patch).length === 0) return res.status(400).json({ message: 'No hay cambios que guardar' });
    patch.updated_at = new Date().toISOString();
    const { data, error } = await supabase
      .from('public_pages')
      .update(patch)
      .eq('id', req.params.id)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ message: 'Página no encontrada' });
    res.json({ message: data.published ? 'Página guardada y publicada' : 'Página guardada', page: data });
  } catch (error) {
    sendError(res, error, 'Error al guardar la página');
  }
};

exports.deletePage = async (req, res) => {
  try {
    const { data: current, error: findError } = await supabase
      .from('public_pages')
      .select('route_path')
      .eq('id', req.params.id)
      .maybeSingle();
    if (findError) throw findError;
    if (current?.route_path) {
      return res.status(400).json({ message: 'Las páginas fijas no se pueden eliminar. Retírala para volver a la versión original.' });
    }
    const { error } = await supabase.from('public_pages').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ message: 'Página eliminada' });
  } catch (error) {
    sendError(res, error, 'Error al eliminar la página');
  }
};

exports.uploadImage = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No se ha proporcionado una imagen' });
    let url;
    try {
      url = await uploadPageImage(req.file);
    } catch (storageError) {
      console.error('No se pudo subir la imagen a Storage, se guarda en disco:', storageError);
      url = saveToDisk('page', req.file);
    }
    res.json({ url });
  } catch (error) {
    sendError(res, error, 'Error al subir la imagen');
  }
};

exports.getPublishedPage = async (req, res) => {
  try {
    const slug = text(req.params.slug, 80).toLowerCase();
    if (!SLUG_RE.test(slug)) return res.status(404).json({ message: 'Página no encontrada' });
    const { data, error } = await supabase
      .from('public_pages')
      .select('id, title, slug, published, blocks')
      .eq('slug', slug)
      .eq('published', true)
      .is('route_path', null)
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ message: 'Página no encontrada' });
    res.json({ page: { ...data, blocks: sanitizeBlocks(data.blocks) } });
  } catch (error) {
    if (error?.status === 400) return res.status(404).json({ message: 'Página no encontrada' });
    sendError(res, error, 'Error al obtener la página');
  }
};

exports.getPublishedRoute = async (req, res) => {
  const routePath = text(req.query.path, 200);
  if (!FIXED_PAGES.some((fixed) => fixed.route_path === routePath)) {
    return res.status(404).json({ message: 'Página no encontrada' });
  }
  try {
    const { data, error } = await supabase
      .from('public_pages')
      .select('id, title, slug, route_path, published, blocks')
      .eq('route_path', routePath)
      .eq('published', true)
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ message: 'Página no encontrada' });
    res.json({ page: { ...data, blocks: sanitizeBlocks(data.blocks) } });
  } catch (error) {
    console.error('Error al obtener la página fija:', error);
    res.status(404).json({ message: 'Página no encontrada' });
  }
};
