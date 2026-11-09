const supabase = require('../database');
const { HOTEL_PAYMENT_BLOCK, HOTEL_PAYMENT_LABEL } = require('../utils/hotelPayment');
const { FIRST_PAYMENT_LABEL } = require('../utils/firstPayment');
const {
  DEFAULT_BODY,
  DEFAULT_SUBJECT,
  DEFAULT_TITLE,
  applyShortcodes,
  getDefaultLogoUrl,
  getEmailTemplate,
  sampleValues,
  saveEmailTemplate,
  shortcodeCatalog,
  uploadEmailLogo,
} = require('../utils/emailTemplate');
const { renderUserInscriptionEmail } = require('../services/emailService');

function cleanText(value, max) {
  const text = String(value ?? '').replace(/\r\n/g, '\n').trim();
  if (!text) return '';
  return text.slice(0, max);
}

async function loadFormFields(eventId) {
  const { data, error } = await supabase
    .from('form_blocks')
    .select('titulo, sort_order, form_fields ( id, label, sort_order )')
    .eq('event_id', eventId)
    .order('sort_order');
  if (error) throw error;

  const fields = [];
  const blocks = [...(data || [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  for (const block of blocks) {
    if (block.titulo === HOTEL_PAYMENT_BLOCK) continue;
    const ordered = [...(block.form_fields || [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    for (const field of ordered) {
      if (field.label === HOTEL_PAYMENT_LABEL || field.label === FIRST_PAYMENT_LABEL) continue;
      fields.push({ id: field.id, label: field.label });
    }
  }
  return fields;
}

async function loadEvent(eventId) {
  const { data, error } = await supabase
    .from('events')
    .select('id, nombre, mes, anio')
    .eq('id', eventId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function present(eventId) {
  const [event, template, fields, defaultLogo] = await Promise.all([
    loadEvent(eventId),
    getEmailTemplate(eventId),
    loadFormFields(eventId),
    getDefaultLogoUrl(),
  ]);
  if (!event) return null;
  return {
    event,
    template: {
      ...template,
      logo_url: template.logo_url || null,
    },
    default_logo_url: defaultLogo,
    shortcodes: shortcodeCatalog(fields),
  };
}

exports.getTemplate = async (req, res) => {
  try {
    const payload = await present(req.params.eventId);
    if (!payload) return res.status(404).json({ message: 'Evento no encontrado' });
    res.json(payload);
  } catch (error) {
    console.error('Error al obtener la plantilla de correo:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

exports.updateTemplate = async (req, res) => {
  try {
    const event = await loadEvent(req.params.eventId);
    if (!event) return res.status(404).json({ message: 'Evento no encontrado' });

    const title = cleanText(req.body.title, 80);
    const subject = cleanText(req.body.subject, 180);
    const body = cleanText(req.body.body, 8000);
    if (!title || !subject || !body) {
      return res.status(400).json({ message: 'El título, el asunto y el cuerpo son obligatorios' });
    }

    const current = await getEmailTemplate(req.params.eventId);
    await saveEmailTemplate(req.params.eventId, {
      title,
      subject,
      body,
      logo_url: current.logo_url,
    });
    const payload = await present(req.params.eventId);
    res.json({ message: 'Correo guardado', ...payload });
  } catch (error) {
    console.error('Error al guardar la plantilla de correo:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

exports.uploadLogo = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Selecciona una imagen' });
    const event = await loadEvent(req.params.eventId);
    if (!event) return res.status(404).json({ message: 'Evento no encontrado' });
    await uploadEmailLogo(req.params.eventId, req.file);
    const payload = await present(req.params.eventId);
    res.json({ message: 'Logotipo actualizado', ...payload });
  } catch (error) {
    console.error('Error al subir el logotipo:', error);
    res.status(500).json({ message: error.message || 'Error al subir el logotipo' });
  }
};

exports.resetLogo = async (req, res) => {
  try {
    const event = await loadEvent(req.params.eventId);
    if (!event) return res.status(404).json({ message: 'Evento no encontrado' });
    const current = await getEmailTemplate(req.params.eventId);
    await saveEmailTemplate(req.params.eventId, { ...current, logo_url: null });
    const payload = await present(req.params.eventId);
    res.json({ message: 'Logotipo de la web restaurado', ...payload });
  } catch (error) {
    console.error('Error al restaurar el logotipo:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

exports.preview = async (req, res) => {
  try {
    const event = await loadEvent(req.params.eventId);
    if (!event) return res.status(404).json({ message: 'Evento no encontrado' });
    const fields = await loadFormFields(req.params.eventId);
    const values = sampleValues(event, fields);
    const current = await getEmailTemplate(req.params.eventId);
    const defaultLogo = await getDefaultLogoUrl();
    const title = cleanText(req.body.title, 80) || DEFAULT_TITLE;
    const subject = cleanText(req.body.subject, 180) || DEFAULT_SUBJECT;
    const body = cleanText(req.body.body, 8000) || DEFAULT_BODY;
    const logoUrl = req.body.logo_url || current.logo_url || defaultLogo;
    const rendered = renderUserInscriptionEmail({ title, subject, body, logoUrl, values });
    res.json(rendered);
  } catch (error) {
    console.error('Error al previsualizar el correo:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

exports.restoreDefault = async (req, res) => {
  try {
    const event = await loadEvent(req.params.eventId);
    if (!event) return res.status(404).json({ message: 'Evento no encontrado' });
    const current = await getEmailTemplate(req.params.eventId);
    await saveEmailTemplate(req.params.eventId, {
      title: DEFAULT_TITLE,
      subject: DEFAULT_SUBJECT,
      body: DEFAULT_BODY,
      logo_url: current.logo_url,
    });
    const payload = await present(req.params.eventId);
    res.json({ message: 'Texto original restaurado', ...payload });
  } catch (error) {
    console.error('Error al restaurar el correo:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};
