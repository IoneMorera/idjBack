const fs = require('fs');
const path = require('path');
const supabase = require('../database');

const LOGO_BUCKET = 'email-logos';
const TEMPLATE_BUCKET = 'email-templates';
const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');

const RESERVED_CODES = new Set([
  'nombre',
  'apellidos',
  'nombre_completo',
  'email',
  'telefono',
  'dni',
  'usuario',
  'evento',
  'mes',
  'anio',
  'estado',
  'tarifa',
  'precio',
]);

const BASE_SHORTCODES = [
  { code: 'nombre', label: 'Nombre', sample: 'Ione' },
  { code: 'apellidos', label: 'Apellidos', sample: 'Morera' },
  { code: 'nombre_completo', label: 'Nombre y apellidos', sample: 'Ione Morera' },
  { code: 'email', label: 'Email', sample: 'ione@example.com' },
  { code: 'telefono', label: 'Teléfono', sample: '600000000' },
  { code: 'dni', label: 'DNI', sample: '00000000T' },
  { code: 'usuario', label: 'Usuario', sample: 'ione' },
  { code: 'evento', label: 'Evento', sample: '' },
  { code: 'mes', label: 'Mes', sample: '' },
  { code: 'anio', label: 'Año', sample: '' },
  { code: 'estado', label: 'Estado de la inscripción', sample: 'Pendiente de Confirmación' },
  { code: 'tarifa', label: 'Tipo de inscripción', sample: 'Viernes a Domingo (Pago Aplazado)' },
  { code: 'precio', label: 'Precio de la tarifa', sample: '155,00 €' },
];

const DEFAULT_TITLE = 'Ludo VyP';
const DEFAULT_SUBJECT = 'Inscripción recibida - [evento]';
const DEFAULT_BODY = `¡Hola [nombre]!

Hemos recibido correctamente tu solicitud de inscripción para el evento [b][evento][/b].

Tu inscripción se encuentra actualmente en estado [b][estado][/b].

Te iremos informando de los siguientes pasos a través de este correo electrónico. Si tienes alguna duda, no dudes en contactarnos.

Puedes consultar el estado de tu inscripción en cualquier momento desde tu área de usuario en nuestra web.`;

let bucketsReady = false;
let defaultLogoUrl = null;

function slugCode(label) {
  const slug = String(label || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 60);
  if (!slug) return '';
  return RESERVED_CODES.has(slug) ? `campo_${slug}` : slug;
}

function plainValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean).join(', ');
  }
  if (value == null) return '';
  const text = String(value).trim();
  if (!text) return '';
  if (text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return plainValue(parsed);
    } catch {
      // Texto normal.
    }
  }
  return text;
}

function defaultTemplate() {
  return {
    title: DEFAULT_TITLE,
    subject: DEFAULT_SUBJECT,
    body: DEFAULT_BODY,
    logo_url: null,
  };
}

async function ensureBuckets() {
  if (bucketsReady) return;
  for (const [name, isPublic] of [[LOGO_BUCKET, true], [TEMPLATE_BUCKET, false]]) {
    const { data, error } = await supabase.storage.getBucket(name);
    if (error || !data) {
      const { error: createError } = await supabase.storage.createBucket(name, {
        public: isPublic,
        fileSizeLimit: 2 * 1024 * 1024,
        allowedMimeTypes: isPublic
          ? ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
          : ['application/json'],
      });
      if (createError && !/already exists|duplicate/i.test(createError.message || '')) {
        throw createError;
      }
    }
  }
  bucketsReady = true;
}

async function getDefaultLogoUrl() {
  if (defaultLogoUrl) return defaultLogoUrl;
  await ensureBuckets();
  const filePath = path.resolve(__dirname, '../../../idjFront/public/icon-192.png');
  if (fs.existsSync(filePath)) {
    const { error } = await supabase.storage.from(LOGO_BUCKET).upload('default.png', fs.readFileSync(filePath), {
      contentType: 'image/png',
      upsert: true,
    });
    if (!error) {
      const { data } = supabase.storage.from(LOGO_BUCKET).getPublicUrl('default.png');
      defaultLogoUrl = data.publicUrl;
      return defaultLogoUrl;
    }
  }
  defaultLogoUrl = `${FRONTEND_URL}/icon-192.png`;
  return defaultLogoUrl;
}

async function readStoredTemplate(eventId) {
  await ensureBuckets();
  const { data, error } = await supabase.storage.from(TEMPLATE_BUCKET).download(`${eventId}.json`);
  if (error || !data) return null;
  const text = typeof data.text === 'function' ? await data.text() : Buffer.from(data).toString('utf8');
  const parsed = JSON.parse(text);
  return {
    title: parsed.title || DEFAULT_TITLE,
    subject: parsed.subject || DEFAULT_SUBJECT,
    body: parsed.body || DEFAULT_BODY,
    logo_url: parsed.logo_url || null,
  };
}

async function getEmailTemplate(eventId) {
  if (!eventId) return defaultTemplate();
  const stored = await readStoredTemplate(eventId);
  return stored || defaultTemplate();
}

async function saveEmailTemplate(eventId, template) {
  await ensureBuckets();
  const payload = Buffer.from(JSON.stringify({
    title: template.title,
    subject: template.subject,
    body: template.body,
    logo_url: template.logo_url || null,
  }));
  const { error } = await supabase.storage.from(TEMPLATE_BUCKET).upload(`${eventId}.json`, payload, {
    contentType: 'application/json',
    upsert: true,
  });
  if (error) throw error;
  return getEmailTemplate(eventId);
}

async function uploadEmailLogo(eventId, file) {
  await ensureBuckets();
  const ext = path.extname(file.originalname || '').toLowerCase() || '.png';
  const objectPath = `event-${eventId}-${Date.now()}${ext}`;
  const { error } = await supabase.storage.from(LOGO_BUCKET).upload(objectPath, file.buffer, {
    contentType: file.mimetype || 'image/png',
    upsert: true,
  });
  if (error) throw error;
  const { data } = supabase.storage.from(LOGO_BUCKET).getPublicUrl(objectPath);
  const current = await getEmailTemplate(eventId);
  current.logo_url = data.publicUrl;
  await saveEmailTemplate(eventId, current);
  return current;
}

function buildShortcodeValues(data) {
  const values = {
    nombre: data.nombre || '',
    apellidos: data.apellidos || '',
    nombre_completo: `${data.nombre || ''} ${data.apellidos || ''}`.trim(),
    email: data.email || '',
    telefono: data.telefono || '',
    dni: data.dni || '',
    usuario: data.usuario || '',
    evento: data.eventName || data.evento || '',
    mes: data.mes || '',
    anio: data.anio != null ? String(data.anio) : '',
    estado: data.estado || '',
    tarifa: data.tarifa || '',
    precio: data.precio || '',
  };
  for (const campo of data.campos || []) {
    const code = slugCode(campo.label);
    if (!code || values[code]) continue;
    values[code] = plainValue(campo.value);
  }
  return values;
}

function sampleValues(event, formFields) {
  const values = buildShortcodeValues({
    nombre: 'Ione',
    apellidos: 'Morera',
    email: 'ione@example.com',
    telefono: '600000000',
    dni: '00000000T',
    usuario: 'ione',
    eventName: event ? `${event.nombre} - ${event.mes} ${event.anio}` : 'IDJ invierno 27 - Febrero 2027',
    mes: event?.mes || 'Febrero',
    anio: event?.anio || '2027',
    estado: 'Pendiente de Confirmación',
    tarifa: 'Viernes a Domingo (Pago Aplazado)',
    precio: '155,00 €',
    campos: (formFields || []).map((field) => ({ label: field.label, value: 'Ejemplo' })),
  });
  return values;
}

function applyShortcodes(template, values) {
  return String(template || '').replace(/\[([a-z0-9_]+)\]/gi, (match, key) => {
    const value = values[String(key).toLowerCase()];
    if (value == null || value === '') return match;
    return String(value);
  });
}

function shortcodeCatalog(formFields) {
  const used = new Set(BASE_SHORTCODES.map((item) => item.code));
  const dynamic = [];
  for (const field of formFields || []) {
    const code = slugCode(field.label);
    if (!code || used.has(code)) continue;
    used.add(code);
    dynamic.push({ code, label: field.label, sample: 'Ejemplo' });
  }
  return { base: BASE_SHORTCODES, campos: dynamic };
}

module.exports = {
  DEFAULT_BODY,
  DEFAULT_SUBJECT,
  DEFAULT_TITLE,
  applyShortcodes,
  buildShortcodeValues,
  defaultTemplate,
  getDefaultLogoUrl,
  getEmailTemplate,
  sampleValues,
  saveEmailTemplate,
  shortcodeCatalog,
  slugCode,
  uploadEmailLogo,
};
