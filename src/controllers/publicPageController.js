const supabase = require('../database');

const SECTION_TYPES = new Set([
  'banner',
  'texto',
  'precios',
  'tarjetas',
  'bloques',
  'faq',
  'inscripcion',
  'contacto',
  'video',
]);

function schemaErrorMessage(error, fallback) {
  const message = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`;
  if (/public_page|does not exist|schema cache|Could not find/i.test(message)) {
    return 'Falta aplicar la migración 010_public_page.sql en Supabase';
  }
  return fallback;
}

function text(value, max = 2000) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

function list(value, max = 30) {
  return Array.isArray(value) ? value.slice(0, max) : [];
}

function keepId(value) {
  if (typeof value === 'string' && /^[a-zA-Z0-9_-]{1,40}$/.test(value)) return value;
  return `id-${Math.random().toString(36).slice(2, 10)}`;
}

function safeUrl(value) {
  const url = text(value, 500);
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('/') && !url.startsWith('//')) return url;
  return null;
}

function safeHref(value) {
  const href = text(value, 300);
  if (!href || href === '#') return '';
  if (href.startsWith('#')) {
    return /^#[a-z0-9]+(?:-[a-z0-9]+)*$/.test(href) ? href : null;
  }
  return safeUrl(href);
}

function sanitizePage(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'La página no tiene un formato válido' };
  }

  const slug = text(body.slug, 80).toLowerCase();
  const published = body.published === true;
  if (slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return { error: 'La dirección solo puede llevar minúsculas, números y guiones' };
  }
  if (published && !slug) {
    return { error: 'Indica una dirección antes de publicar la página' };
  }

  const header = [];
  for (const link of list(body.header, 20)) {
    if (!link || typeof link !== 'object') continue;
    const label = text(link.label, 80);
    const href = safeHref(link.href);
    if (href === null) return { error: 'Un enlace de la cabecera no es válido. Usa #ancla, una ruta interna o una URL http(s)' };
    header.push({ id: keepId(link.id), label, href });
  }

  const sections = [];
  const anchors = new Set();
  for (const section of list(body.sections, 30)) {
    if (!section || typeof section !== 'object') continue;
    if (!SECTION_TYPES.has(section.type)) {
      return { error: 'Hay una sección de un tipo que no existe' };
    }
    const anchor = text(section.anchor, 80).toLowerCase();
    if (anchor && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(anchor)) {
      return { error: 'El ancla de una sección solo puede llevar minúsculas, números y guiones' };
    }
    if (anchor && anchors.has(anchor)) {
      return { error: `El ancla «${anchor}» está repetida` };
    }
    if (anchor) anchors.add(anchor);

    const image = safeUrl(section.image);
    const url = safeUrl(section.url);
    if (image === null || url === null) {
      return { error: 'Una imagen o un enlace de sección no es válido. Usa una ruta interna o una URL http(s)' };
    }

    const lines = list(section.lines, 40)
      .map((line) => text(line, 2000))
      .filter(Boolean);

    const blocks = [];
    for (const block of list(section.blocks, 20)) {
      if (!block || typeof block !== 'object') continue;
      if (block.kind === 'list') {
        const items = text(block.itemsText, 4000)
          .split('\n')
          .map((item) => item.trim())
          .filter(Boolean)
          .slice(0, 30);
        blocks.push({
          id: keepId(block.id),
          kind: 'list',
          text: '',
          intro: text(block.intro, 500),
          itemsText: items.join('\n'),
          outro: text(block.outro, 2000),
        });
      } else {
        blocks.push({
          id: keepId(block.id),
          kind: 'text',
          text: text(block.text, 4000),
          intro: '',
          itemsText: '',
          outro: '',
        });
      }
    }

    const cards = list(section.cards, 20)
      .filter((card) => card && typeof card === 'object')
      .map((card) => ({
        id: keepId(card.id),
        title: text(card.title, 160),
        price: text(card.price, 80),
        detail: text(card.detail, 500),
      }));

    const entries = list(section.entries, 20)
      .filter((entry) => entry && typeof entry === 'object')
      .map((entry) => {
        const entryImage = safeUrl(entry.image);
        return {
          id: keepId(entry.id),
          badge: text(entry.badge, 80),
          title: text(entry.title, 200),
          description: text(entry.description, 2000),
          image: entryImage || '',
          question: text(entry.question, 300),
          answer: text(entry.answer, 2000),
          imageInvalid: entryImage === null,
        };
      });

    if (entries.some((entry) => entry.imageInvalid)) {
      return { error: 'Una imagen de bloque no es válida. Usa una ruta interna o una URL http(s)' };
    }

    sections.push({
      id: keepId(section.id),
      type: section.type,
      anchor,
      label: text(section.label, 120),
      title: text(section.title, 200),
      highlight: text(section.highlight, 200),
      subtitle: text(section.subtitle, 500),
      image,
      alt: text(section.alt, 160),
      email: text(section.email, 200),
      buttonLabel: text(section.buttonLabel, 160),
      url,
      lines,
      blocks,
      cards,
      entries: entries.map(({ imageInvalid, ...entry }) => entry),
    });
  }

  return { page: { slug, published, header, sections } };
}

function emptyPage() {
  return { slug: '', published: false, header: [], sections: [] };
}

async function loadEvent(id) {
  const { data, error } = await supabase
    .from('events')
    .select('id, nombre, mes, anio, public_page')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

exports.getPage = async (req, res) => {
  try {
    const event = await loadEvent(req.params.id);
    if (!event) return res.status(404).json({ message: 'Evento no encontrado' });
    const stored = event.public_page && typeof event.public_page === 'object' ? event.public_page : emptyPage();
    const sanitized = sanitizePage(stored);
    res.json({
      event: { id: event.id, nombre: event.nombre, mes: event.mes, anio: event.anio },
      page: sanitized.page || emptyPage(),
    });
  } catch (error) {
    console.error('Error al cargar la página pública:', error);
    res.status(500).json({ message: schemaErrorMessage(error, 'Error al cargar la página pública') });
  }
};

exports.savePage = async (req, res) => {
  try {
    const event = await loadEvent(req.params.id);
    if (!event) return res.status(404).json({ message: 'Evento no encontrado' });

    const sanitized = sanitizePage(req.body);
    if (sanitized.error) return res.status(400).json({ message: sanitized.error });

    if (sanitized.page.slug) {
      const { data: others, error: dupError } = await supabase
        .from('events')
        .select('id')
        .filter('public_page->>slug', 'eq', sanitized.page.slug)
        .neq('id', req.params.id);
      if (dupError) throw dupError;
      if (others?.length) {
        return res.status(400).json({ message: 'Esa dirección ya la usa otro evento' });
      }
    }

    const { error } = await supabase
      .from('events')
      .update({ public_page: sanitized.page })
      .eq('id', req.params.id);
    if (error) throw error;

    res.json({
      message: sanitized.page.published ? 'Página pública guardada y publicada' : 'Página pública guardada',
      event: { id: event.id, nombre: event.nombre, mes: event.mes, anio: event.anio },
      page: sanitized.page,
    });
  } catch (error) {
    console.error('Error al guardar la página pública:', error);
    res.status(500).json({ message: schemaErrorMessage(error, 'Error al guardar la página pública') });
  }
};

exports.getPublishedPage = async (req, res) => {
  try {
    const slug = text(req.params.slug, 80).toLowerCase();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      return res.status(404).json({ message: 'Página no encontrada' });
    }

    const { data, error } = await supabase
      .from('events')
      .select('id, nombre, mes, anio, public_page')
      .filter('public_page->>slug', 'eq', slug)
      .maybeSingle();
    if (error) throw error;

    const page = data?.public_page;
    if (!data || !page || page.published !== true) {
      return res.status(404).json({ message: 'Página no encontrada' });
    }

    const sanitized = sanitizePage(page);
    res.json({
      event: { id: data.id, nombre: data.nombre, mes: data.mes, anio: data.anio },
      page: sanitized.page || emptyPage(),
    });
  } catch (error) {
    console.error('Error al obtener la página pública:', error);
    res.status(500).json({ message: schemaErrorMessage(error, 'Error al obtener la página pública') });
  }
};
