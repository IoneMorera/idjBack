const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const supabase = require('../database');

const LOGO_BUCKET = 'email-logos';
const TEMPLATE_BUCKET = 'email-templates';
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

const DEFAULT_EMAIL_NAME = 'Correo al Usuario';
const SIN_INSCRIBIR_STATE = 'Sin inscribir';
const PENDIENTE_STATE = 'Pendiente de Confirmación';
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

const PUBLIC_LOGO_URL = 'https://ludovyp.com/icon-192.png';

function publicHttpsUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname !== 'localhost';
  } catch {
    return false;
  }
}

async function getDefaultLogoUrl() {
  if (defaultLogoUrl) return defaultLogoUrl;
  await ensureBuckets();
  const filePath = path.resolve(__dirname, '../../../idjFront/public/icon-192.png');
  if (fs.existsSync(filePath)) {
    await supabase.storage.from(LOGO_BUCKET).upload('default.png', fs.readFileSync(filePath), {
      contentType: 'image/png',
      upsert: true,
    });
  }
  const { data } = supabase.storage.from(LOGO_BUCKET).getPublicUrl('default.png');
  if (publicHttpsUrl(data.publicUrl)) {
    try {
      const response = await fetch(data.publicUrl, { method: 'HEAD' });
      if (response.ok) {
        defaultLogoUrl = data.publicUrl;
        return defaultLogoUrl;
      }
    } catch {
      // El logo de la web sigue disponible.
    }
  }
  defaultLogoUrl = PUBLIC_LOGO_URL;
  return defaultLogoUrl;
}

function cleanName(value) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.slice(0, 80);
}

function normalizeEmail(raw) {
  const content = raw && typeof raw === 'object' ? raw : {};
  return {
    id: String(content.id || 'default'),
    name: cleanName(content.name) || DEFAULT_EMAIL_NAME,
    title: content.title || DEFAULT_TITLE,
    subject: content.subject || DEFAULT_SUBJECT,
    body: content.body || DEFAULT_BODY,
    logo_url: content.logo_url || null,
    trigger_enabled: content.trigger_enabled === true,
    from_state: content.from_state || null,
    to_state: content.to_state || null,
  };
}

function defaultTriggeredEmail(content = defaultTemplate()) {
  return normalizeEmail({
    id: 'default',
    name: DEFAULT_EMAIL_NAME,
    ...content,
    trigger_enabled: true,
    from_state: SIN_INSCRIBIR_STATE,
    to_state: PENDIENTE_STATE,
  });
}

async function readRawTemplate(eventId) {
  await ensureBuckets();
  const { data, error } = await supabase.storage.from(TEMPLATE_BUCKET).download(`${eventId}.json`);
  if (error || !data) return null;
  const text = typeof data.text === 'function' ? await data.text() : Buffer.from(data).toString('utf8');
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function loadEmails(eventId) {
  if (!eventId) return [defaultTriggeredEmail()];
  const parsed = await readRawTemplate(eventId);
  if (!parsed) return [defaultTriggeredEmail()];
  if (Array.isArray(parsed.emails)) {
    return parsed.emails.map(normalizeEmail);
  }
  if (parsed.title || parsed.subject || parsed.body || parsed.logo_url) {
    return [defaultTriggeredEmail(parsed)];
  }
  return [defaultTriggeredEmail()];
}

async function saveEmails(eventId, emails) {
  await ensureBuckets();
  const payload = Buffer.from(JSON.stringify({
    emails: emails.map(normalizeEmail),
  }));
  const { error } = await supabase.storage.from(TEMPLATE_BUCKET).upload(`${eventId}.json`, payload, {
    contentType: 'application/json',
    upsert: true,
  });
  if (error) throw error;
  return loadEmails(eventId);
}

async function getEmailById(eventId, emailId) {
  const emails = await loadEmails(eventId);
  return emails.find((email) => email.id === String(emailId)) || null;
}

async function getEmailTemplate(eventId) {
  if (!eventId) return defaultTemplate();
  const emails = await loadEmails(eventId);
  const main = emails.find((email) => (
    email.trigger_enabled
    && email.from_state === SIN_INSCRIBIR_STATE
    && email.to_state === PENDIENTE_STATE
  )) || emails[0];
  if (!main) return defaultTemplate();
  return {
    title: main.title,
    subject: main.subject,
    body: main.body,
    logo_url: main.logo_url,
  };
}

async function saveEmailTemplate(eventId, template) {
  const emails = await loadEmails(eventId);
  const index = emails.findIndex((email) => email.id === 'default');
  const target = index >= 0 ? index : 0;
  emails[target] = normalizeEmail({
    ...emails[target],
    title: template.title,
    subject: template.subject,
    body: template.body,
    logo_url: template.logo_url || null,
  });
  await saveEmails(eventId, emails);
  return getEmailTemplate(eventId);
}

async function uploadEmailLogo(eventId, emailId, file) {
  await ensureBuckets();
  const emails = await loadEmails(eventId);
  const index = emails.findIndex((email) => email.id === String(emailId));
  if (index < 0) {
    const missing = new Error('Correo no encontrado');
    missing.status = 404;
    throw missing;
  }
  const ext = path.extname(file.originalname || '').toLowerCase() || '.png';
  const safeId = String(emailId).replace(/[^a-zA-Z0-9_-]/g, '');
  const objectPath = `event-${eventId}-${safeId}-${Date.now()}${ext}`;
  const { error } = await supabase.storage.from(LOGO_BUCKET).upload(objectPath, file.buffer, {
    contentType: file.mimetype || 'image/png',
    upsert: true,
  });
  if (error) throw error;
  const { data } = supabase.storage.from(LOGO_BUCKET).getPublicUrl(objectPath);
  emails[index] = { ...emails[index], logo_url: data.publicUrl };
  await saveEmails(eventId, emails);
  return emails[index];
}

function createEmailRecord(name) {
  return normalizeEmail({
    id: crypto.randomUUID(),
    name: cleanName(name) || 'Nuevo correo',
    ...defaultTemplate(),
    trigger_enabled: false,
    from_state: null,
    to_state: null,
  });
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
  DEFAULT_EMAIL_NAME,
  DEFAULT_SUBJECT,
  DEFAULT_TITLE,
  PENDIENTE_STATE,
  SIN_INSCRIBIR_STATE,
  applyShortcodes,
  buildShortcodeValues,
  createEmailRecord,
  defaultTemplate,
  getDefaultLogoUrl,
  getEmailById,
  getEmailTemplate,
  loadEmails,
  sampleValues,
  saveEmailTemplate,
  saveEmails,
  shortcodeCatalog,
  slugCode,
  uploadEmailLogo,
};
