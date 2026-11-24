const supabase = require('../database');

function schemaErrorMessage(error, fallback) {
  const message = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`;
  if (/site_settings|does not exist|schema cache|Could not find/i.test(message)) {
    return 'Falta aplicar la migración 011_site_header.sql en Supabase';
  }
  return fallback;
}

function isMissingSchema(error) {
  const message = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`;
  return /site_settings|does not exist|schema cache|Could not find/i.test(message);
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

function safeHref(value) {
  const href = text(value, 300);
  if (!href || href === '#') return '';
  if (href.startsWith('#')) return /^#[a-z0-9]+(?:-[a-z0-9]+)*$/.test(href) ? href : null;
  if (/^https?:\/\//i.test(href)) return href;
  if (href.startsWith('/') && !href.startsWith('//')) return href;
  return null;
}

function sanitizeHeader(body) {
  const source = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const menus = [];
  for (const menu of list(source.menus, 12)) {
    if (!menu || typeof menu !== 'object') continue;
    const items = [];
    for (const item of list(menu.items, 12)) {
      if (!item || typeof item !== 'object') continue;
      const href = safeHref(item.href);
      if (href === null) return { error: 'Un enlace de la cabecera no es válido. Usa una ruta interna, #ancla o una URL http(s)' };
      items.push({ id: keepId(item.id), label: text(item.label, 80), href });
    }
    menus.push({ id: keepId(menu.id), label: text(menu.label, 40), items });
  }

  const links = [];
  for (const link of list(source.links, 12)) {
    if (!link || typeof link !== 'object') continue;
    const href = safeHref(link.href);
    if (href === null) return { error: 'Un enlace de la cabecera no es válido. Usa una ruta interna, #ancla o una URL http(s)' };
    links.push({ id: keepId(link.id), label: text(link.label, 80), href });
  }

  return { header: { menus, links } };
}

async function readHeader() {
  const { data, error } = await supabase
    .from('site_settings')
    .select('value')
    .eq('key', 'header')
    .maybeSingle();
  if (error) throw error;
  if (!data?.value) return null;
  const sanitized = sanitizeHeader(data.value);
  return sanitized.header || null;
}

exports.getPublicHeader = async (req, res) => {
  try {
    const header = await readHeader();
    res.json({ header });
  } catch (error) {
    if (isMissingSchema(error)) return res.json({ header: null });
    console.error('Error al obtener la cabecera:', error);
    res.status(500).json({ message: schemaErrorMessage(error, 'Error al obtener la cabecera') });
  }
};

exports.getHeader = async (req, res) => {
  try {
    const header = await readHeader();
    res.json({ header });
  } catch (error) {
    if (isMissingSchema(error)) {
      return res.json({ header: null, message: schemaErrorMessage(error, 'Error al obtener la cabecera') });
    }
    console.error('Error al obtener la cabecera:', error);
    res.status(500).json({ message: schemaErrorMessage(error, 'Error al obtener la cabecera') });
  }
};

exports.saveHeader = async (req, res) => {
  try {
    const sanitized = sanitizeHeader(req.body);
    if (sanitized.error) return res.status(400).json({ message: sanitized.error });

    const { error } = await supabase
      .from('site_settings')
      .upsert({ key: 'header', value: sanitized.header, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (error) throw error;

    res.json({ message: 'Cabecera guardada', header: sanitized.header });
  } catch (error) {
    console.error('Error al guardar la cabecera:', error);
    res.status(500).json({ message: schemaErrorMessage(error, 'Error al guardar la cabecera') });
  }
};
