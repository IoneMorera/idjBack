const supabase = require('../database');
const { HOTEL_PAYMENT_BLOCK, HOTEL_PAYMENT_LABEL } = require('../utils/hotelPayment');
const { FIRST_PAYMENT_LABEL } = require('../utils/firstPayment');
const {
  DEFAULT_BODY,
  DEFAULT_SUBJECT,
  DEFAULT_TITLE,
  createEmailRecord,
  getDefaultLogoUrl,
  getEmailById,
  loadEmails,
  sampleValues,
  saveEmails,
  shortcodeCatalog,
  uploadEmailLogo,
} = require('../utils/emailTemplate');
const { renderUserInscriptionEmail, sendStoredTemplate } = require('../services/emailService');

function cleanText(value, max) {
  const text = String(value ?? '').replace(/\r\n/g, '\n').trim();
  if (!text) return '';
  return text.slice(0, max);
}

function cleanState(value) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || null;
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

function summarize(email) {
  return {
    id: email.id,
    name: email.name,
    subject: email.subject,
    trigger_enabled: email.trigger_enabled,
    from_state: email.from_state,
    to_state: email.to_state,
  };
}

async function presentEmail(eventId, email) {
  const [event, fields, defaultLogo] = await Promise.all([
    loadEvent(eventId),
    loadFormFields(eventId),
    getDefaultLogoUrl(),
  ]);
  if (!event || !email) return null;
  return {
    event,
    template: {
      ...email,
      logo_url: email.logo_url || null,
    },
    default_logo_url: defaultLogo,
    shortcodes: shortcodeCatalog(fields),
  };
}

async function knownStateNames(names) {
  const unique = [...new Set(names.filter(Boolean))];
  if (unique.length === 0) return new Set();
  const { data, error } = await supabase
    .from('inscription_states')
    .select('nombre')
    .in('nombre', unique);
  if (error) throw error;
  return new Set((data || []).map((state) => state.nombre));
}

function formatPrice(value) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(Number(value));
}

async function camposForInscription(eventId, inscriptionId) {
  const fields = await loadFormFields(eventId);
  if (!inscriptionId) return fields.map((field) => ({ label: field.label, value: '' }));
  const { data, error } = await supabase
    .from('inscription_field_values')
    .select('field_id, value')
    .eq('inscription_id', inscriptionId);
  if (error) throw error;
  const byField = Object.fromEntries((data || []).map((row) => [row.field_id, row.value]));
  return fields.map((field) => ({ label: field.label, value: byField[field.id] ?? '' }));
}

exports.listTemplates = async (req, res) => {
  try {
    const event = await loadEvent(req.params.eventId);
    if (!event) return res.status(404).json({ message: 'Evento no encontrado' });
    const [emails, statesResult] = await Promise.all([
      loadEmails(req.params.eventId),
      supabase.from('inscription_states').select('id, nombre').order('id'),
    ]);
    if (statesResult.error) throw statesResult.error;
    res.json({
      event,
      emails: emails.map(summarize),
      states: statesResult.data || [],
    });
  } catch (error) {
    console.error('Error al listar correos:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

exports.createTemplate = async (req, res) => {
  try {
    const event = await loadEvent(req.params.eventId);
    if (!event) return res.status(404).json({ message: 'Evento no encontrado' });
    const emails = await loadEmails(req.params.eventId);
    const name = cleanText(req.body.name, 80);
    if (!name) {
      return res.status(400).json({ message: 'El nombre del correo es obligatorio' });
    }
    if (emails.some((email) => email.name.toLowerCase() === name.toLowerCase())) {
      return res.status(400).json({ message: 'Ya hay un correo con ese nombre' });
    }
    const created = createEmailRecord(name);
    emails.push(created);
    await saveEmails(req.params.eventId, emails);
    res.status(201).json({ message: 'Correo creado', email: summarize(created) });
  } catch (error) {
    console.error('Error al crear el correo:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

exports.deleteTemplate = async (req, res) => {
  try {
    const event = await loadEvent(req.params.eventId);
    if (!event) return res.status(404).json({ message: 'Evento no encontrado' });
    const emails = await loadEmails(req.params.eventId);
    const index = emails.findIndex((email) => email.id === String(req.params.emailId));
    if (index < 0) return res.status(404).json({ message: 'Correo no encontrado' });
    emails.splice(index, 1);
    await saveEmails(req.params.eventId, emails);
    res.json({ message: 'Correo eliminado' });
  } catch (error) {
    console.error('Error al eliminar el correo:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

exports.getTemplate = async (req, res) => {
  try {
    const email = await getEmailById(req.params.eventId, req.params.emailId);
    const payload = await presentEmail(req.params.eventId, email);
    if (!payload) return res.status(404).json({ message: email ? 'Evento no encontrado' : 'Correo no encontrado' });
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

    const name = cleanText(req.body.name, 80);
    const title = cleanText(req.body.title, 80);
    const subject = cleanText(req.body.subject, 180);
    const body = cleanText(req.body.body, 8000);
    if (!name || !title || !subject || !body) {
      return res.status(400).json({ message: 'El nombre, el título, el asunto y el cuerpo son obligatorios' });
    }

    const emails = await loadEmails(req.params.eventId);
    const index = emails.findIndex((email) => email.id === String(req.params.emailId));
    if (index < 0) return res.status(404).json({ message: 'Correo no encontrado' });
    emails[index] = {
      ...emails[index],
      name,
      title,
      subject,
      body,
    };
    await saveEmails(req.params.eventId, emails);
    const payload = await presentEmail(req.params.eventId, emails[index]);
    res.json({ message: 'Correo guardado', ...payload });
  } catch (error) {
    console.error('Error al guardar la plantilla de correo:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

exports.updateTrigger = async (req, res) => {
  try {
    const event = await loadEvent(req.params.eventId);
    if (!event) return res.status(404).json({ message: 'Evento no encontrado' });

    const emails = await loadEmails(req.params.eventId);
    const index = emails.findIndex((email) => email.id === String(req.params.emailId));
    if (index < 0) return res.status(404).json({ message: 'Correo no encontrado' });

    const triggerEnabled = req.body.trigger_enabled === true;
    const fromState = cleanState(req.body.from_state);
    const toState = cleanState(req.body.to_state);
    if (triggerEnabled && fromState && toState && fromState === toState) {
      return res.status(400).json({ message: 'El estado de origen y el de destino tienen que ser distintos' });
    }
    if (fromState || toState) {
      const known = await knownStateNames([fromState, toState]);
      if ((fromState && !known.has(fromState)) || (toState && !known.has(toState))) {
        return res.status(400).json({ message: 'Estado no válido' });
      }
    }

    emails[index] = {
      ...emails[index],
      trigger_enabled: triggerEnabled,
      from_state: fromState,
      to_state: toState,
    };
    await saveEmails(req.params.eventId, emails);
    res.json({ message: 'Asociación actualizada', email: summarize(emails[index]) });
  } catch (error) {
    console.error('Error al asociar el correo a un estado:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

exports.uploadLogo = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Selecciona una imagen' });
    const event = await loadEvent(req.params.eventId);
    if (!event) return res.status(404).json({ message: 'Evento no encontrado' });
    const email = await uploadEmailLogo(req.params.eventId, req.params.emailId, req.file);
    const payload = await presentEmail(req.params.eventId, email);
    res.json({ message: 'Logotipo actualizado', ...payload });
  } catch (error) {
    console.error('Error al subir el logotipo:', error);
    const status = error.status || 500;
    res.status(status).json({ message: error.message || 'Error al subir el logotipo' });
  }
};

exports.resetLogo = async (req, res) => {
  try {
    const event = await loadEvent(req.params.eventId);
    if (!event) return res.status(404).json({ message: 'Evento no encontrado' });
    const emails = await loadEmails(req.params.eventId);
    const index = emails.findIndex((email) => email.id === String(req.params.emailId));
    if (index < 0) return res.status(404).json({ message: 'Correo no encontrado' });
    emails[index] = { ...emails[index], logo_url: null };
    await saveEmails(req.params.eventId, emails);
    const payload = await presentEmail(req.params.eventId, emails[index]);
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
    const email = await getEmailById(req.params.eventId, req.params.emailId);
    if (!email) return res.status(404).json({ message: 'Correo no encontrado' });
    const fields = await loadFormFields(req.params.eventId);
    const values = sampleValues(event, fields);
    const defaultLogo = await getDefaultLogoUrl();
    const title = cleanText(req.body.title, 80) || DEFAULT_TITLE;
    const subject = cleanText(req.body.subject, 180) || DEFAULT_SUBJECT;
    const body = cleanText(req.body.body, 8000) || DEFAULT_BODY;
    const logoUrl = req.body.logo_url || email.logo_url || defaultLogo;
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
    const emails = await loadEmails(req.params.eventId);
    const index = emails.findIndex((email) => email.id === String(req.params.emailId));
    if (index < 0) return res.status(404).json({ message: 'Correo no encontrado' });
    emails[index] = {
      ...emails[index],
      title: DEFAULT_TITLE,
      subject: DEFAULT_SUBJECT,
      body: DEFAULT_BODY,
    };
    await saveEmails(req.params.eventId, emails);
    const payload = await presentEmail(req.params.eventId, emails[index]);
    res.json({ message: 'Texto original restaurado', ...payload });
  } catch (error) {
    console.error('Error al restaurar el correo:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

exports.sendTemplate = async (req, res) => {
  try {
    const event = await loadEvent(req.params.eventId);
    if (!event) return res.status(404).json({ message: 'Evento no encontrado' });
    const email = await getEmailById(req.params.eventId, req.params.emailId);
    if (!email) return res.status(404).json({ message: 'Correo no encontrado' });

    const userIds = [...new Set(
      (Array.isArray(req.body.user_ids) ? req.body.user_ids : [])
        .map((id) => Number(id))
        .filter((id) => Number.isInteger(id) && id > 0),
    )];
    if (userIds.length === 0) {
      return res.status(400).json({ message: 'Selecciona al menos un usuario' });
    }
    if (userIds.length > 200) {
      return res.status(400).json({ message: 'Puedes enviar el correo a 200 usuarios como máximo cada vez' });
    }

    const [{ data: users, error: usersError }, { data: inscriptions, error: inscriptionsError }] = await Promise.all([
      supabase.from('users').select('id, username, nombre, apellidos, email, telefono').in('id', userIds),
      supabase
        .from('inscriptions')
        .select('*, inscription_states ( nombre ), event_tariffs ( nombre, precio_total )')
        .eq('event_id', event.id)
        .in('user_id', userIds),
    ]);
    if (usersError) throw usersError;
    if (inscriptionsError) throw inscriptionsError;

    const inscriptionByUser = new Map((inscriptions || []).map((row) => [row.user_id, row]));
    const eventName = `${event.nombre} - ${event.mes} ${event.anio}`;
    let sent = 0;
    const failed = [];

    for (const user of users || []) {
      if (!user.email) {
        failed.push({ user_id: user.id, message: 'El usuario no tiene correo' });
        continue;
      }
      const inscription = inscriptionByUser.get(user.id);
      try {
        const campos = await camposForInscription(event.id, inscription?.id);
        const tarifa = inscription?.event_tariffs?.nombre || '';
        const precio = inscription?.event_tariffs?.precio_total != null
          ? formatPrice(inscription.event_tariffs.precio_total)
          : '';
        await sendStoredTemplate(email, {
          eventId: event.id,
          email: inscription?.email || user.email,
          nombre: inscription?.nombre || user.nombre,
          apellidos: inscription?.apellidos || user.apellidos,
          telefono: inscription?.telefono || user.telefono,
          dni: inscription?.dni || '',
          usuario: user.username,
          eventName,
          mes: event.mes,
          anio: event.anio,
          estado: inscription?.inscription_states?.nombre || 'Sin inscribir',
          tarifa,
          precio,
          campos,
        });
        sent += 1;
      } catch (sendError) {
        console.error(`Error al enviar el correo a ${user.email}:`, sendError);
        failed.push({ user_id: user.id, email: user.email, message: 'No se pudo enviar' });
      }
    }

    const missing = userIds.filter((id) => !(users || []).some((user) => user.id === id));
    for (const id of missing) failed.push({ user_id: id, message: 'Usuario no encontrado' });

    if (sent === 0) {
      return res.status(502).json({ message: 'No se pudo enviar el correo', sent, failed });
    }
    res.json({
      message: failed.length ? `Enviado a ${sent} usuarios. ${failed.length} no se pudieron enviar.` : `Correo enviado a ${sent} usuarios`,
      sent,
      failed,
    });
  } catch (error) {
    console.error('Error al enviar el correo:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};
