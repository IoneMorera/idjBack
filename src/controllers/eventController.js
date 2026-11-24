const supabase = require('../database');
const { inscriptionCounts, inscriptionCountsForEvents, withAvailability } = require('../utils/inscriptionWindow');
const { uploadEventLogo, saveToDisk } = require('../utils/profilePhoto');
const { isStaff, maskTesting } = require('../utils/access');

function schemaErrorMessage(error, fallback) {
  const message = `${error?.message || ''} ${error?.details || ''}`;
  if (/en_pruebas/i.test(message)) {
    return 'Falta aplicar la migración 007_developer_role.sql en Supabase';
  }
  if (/manual_food|event_manual_food/i.test(message)) {
    return 'Falta aplicar la migración 011_manual_food.sql en Supabase';
  }
  if (/bgg_username|games_enabled|snacks_enabled|logo_url|event_rooms|event_games|event_snack/i.test(message)) {
    return 'Falta aplicar la migración 006_rooms_games_snacks.sql en Supabase';
  }
  if (/starts_on|ends_on/i.test(message)) {
    return 'Falta aplicar la migración 012_event_dates.sql en Supabase';
  }
  if (/does not exist|schema cache|inscription_starts_at|max_inscriptions/i.test(message)) {
    return 'Falta aplicar la migración 005_inscription_window.sql en Supabase';
  }
  return fallback;
}

function parseDateInput(value, label) {
  if (value === undefined) return { skip: true };
  if (value === null || value === '') return { value: null };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { error: `${label} no es una fecha válida` };
  }
  return { value: date.toISOString() };
}

function parseDateOnly(value, label) {
  if (value === undefined) return { skip: true };
  if (value === null || value === '') return { value: null };
  const text = String(value).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return { error: `${label} no es una fecha válida` };
  }
  const [year, month, day] = text.split('-').map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) {
    return { error: `${label} no es una fecha válida` };
  }
  return { value: text };
}

function eventDatePatch(body, current) {
  const hasStart = 'starts_on' in body;
  const hasEnd = 'ends_on' in body;
  if (!hasStart && !hasEnd) return { patch: {} };

  const start = parseDateOnly(hasStart ? body.starts_on : current?.starts_on, 'La fecha de inicio del evento');
  const end = parseDateOnly(hasEnd ? body.ends_on : current?.ends_on, 'La fecha de fin del evento');
  if (start.error) return { error: start.error };
  if (end.error) return { error: end.error };
  if (!start.value || !end.value) {
    return { error: 'Indica la fecha de inicio y la de fin del evento' };
  }
  if (start.value > end.value) {
    return { error: 'La fecha de fin del evento tiene que ser igual o posterior a la de inicio' };
  }
  return { patch: { starts_on: start.value, ends_on: end.value } };
}

async function presentEvent(event, { counts = false } = {}) {
  const presented = withAvailability(event);
  if (!counts) return presented;
  const { stateIds, ...totals } = await inscriptionCounts(event.id);
  return { ...presented, ...totals };
}

exports.getAllEvents = async (req, res) => {
  try {
    const { data: events, error } = await supabase
      .from('events')
      .select('*')
      .order('anio', { ascending: false })
      .order('mes', { ascending: true });

    if (error) throw error;

    const staff = isStaff(req.user);
    const visible = (events || []).filter((event) => staff || (!event.hidden && !event.en_pruebas));

    const [inscriptionsResult, countsByEvent] = await Promise.all([
      req.user?.id
        ? supabase
          .from('inscriptions')
          .select('event_id, inscription_states ( nombre )')
          .eq('user_id', req.user.id)
        : Promise.resolve({ data: [] }),
      staff
        ? inscriptionCountsForEvents(visible.map((event) => event.id))
        : Promise.resolve({}),
    ]);

    if (inscriptionsResult.error) throw inscriptionsResult.error;

    const stateByEvent = Object.fromEntries(
      (inscriptionsResult.data || []).map((row) => [row.event_id, row.inscription_states?.nombre || null]),
    );
    const withState = visible.map((event) => {
      const presented = maskTesting({
        ...withAvailability(event),
        ...(staff ? countsByEvent[event.id] : {}),
        mi_estado: stateByEvent[event.id] || 'Sin inscribir',
      }, req.user);
      if (!staff) delete presented.max_inscriptions;
      return presented;
    });

    res.json({ events: withState });
  } catch (error) {
    console.error('Error al obtener eventos:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

exports.getEventById = async (req, res) => {
  try {
    const { data: event, error } = await supabase
      .from('events')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();

    if (error) throw error;
    if (!event) return res.status(404).json({ message: 'Evento no encontrado' });

    const staff = isStaff(req.user);
    if ((event.hidden || event.en_pruebas) && !staff) {
      return res.status(404).json({ message: 'Evento no encontrado' });
    }

    const presented = maskTesting(await presentEvent(event, { counts: staff }), req.user);
    if (!staff) delete presented.max_inscriptions;
    res.json({ event: presented });
  } catch (error) {
    console.error('Error al obtener evento:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

exports.createEvent = async (req, res) => {
  try {
    const { nombre, mes, anio, inscription_starts_at, inscription_ends_at, starts_on, ends_on } = req.body;

    if (!nombre || !mes || !anio) {
      return res.status(400).json({ message: 'Nombre, mes y año son obligatorios' });
    }

    const start = parseDateInput(inscription_starts_at, 'La fecha de inicio');
    const end = parseDateInput(inscription_ends_at, 'La fecha de fin');
    if (start.error) return res.status(400).json({ message: start.error });
    if (end.error) return res.status(400).json({ message: end.error });

    const startsAt = start.skip ? null : start.value;
    const endsAt = end.skip ? null : end.value;
    if ((startsAt && !endsAt) || (!startsAt && endsAt)) {
      return res.status(400).json({ message: 'Indica la fecha de inicio y la de fin de las inscripciones' });
    }
    if (startsAt && endsAt && new Date(startsAt) >= new Date(endsAt)) {
      return res.status(400).json({ message: 'La fecha de fin tiene que ser posterior a la de inicio' });
    }

    const eventDates = eventDatePatch({ starts_on: starts_on ?? null, ends_on: ends_on ?? null });
    if (eventDates.error) return res.status(400).json({ message: eventDates.error });

    const row = { nombre, mes, anio, ...eventDates.patch };
    if (startsAt) row.inscription_starts_at = startsAt;
    if (endsAt) row.inscription_ends_at = endsAt;

    const { data: event, error } = await supabase
      .from('events')
      .insert(row)
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({ message: 'Evento creado correctamente', event: withAvailability(event) });
  } catch (error) {
    console.error('Error al crear evento:', error);
    res.status(500).json({ message: schemaErrorMessage(error, 'Error interno del servidor') });
  }
};

exports.updateEventSettings = async (req, res) => {
  try {
    const { data: current, error: findError } = await supabase
      .from('events')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();

    if (findError) throw findError;
    if (!current) return res.status(404).json({ message: 'Evento no encontrado' });

    const patch = {};

    if ('inscriptions_closed' in req.body) {
      if (typeof req.body.inscriptions_closed !== 'boolean') {
        return res.status(400).json({ message: 'Cerrar inscripciones tiene que ser sí o no' });
      }
      patch.inscriptions_closed = req.body.inscriptions_closed;
    }

    if ('hidden' in req.body) {
      if (typeof req.body.hidden !== 'boolean') {
        return res.status(400).json({ message: 'Ocultar evento tiene que ser sí o no' });
      }
      patch.hidden = req.body.hidden;
    }

    for (const field of ['en_pruebas', 'inscription_en_pruebas', 'food_en_pruebas', 'games_en_pruebas', 'snacks_en_pruebas', 'manual_food_en_pruebas']) {
      if (field in req.body) {
        if (typeof req.body[field] !== 'boolean') {
          return res.status(400).json({ message: 'En pruebas tiene que ser sí o no' });
        }
        patch[field] = req.body[field];
      }
    }

    if ('max_inscriptions' in req.body) {
      const raw = req.body.max_inscriptions;
      if (raw === null || raw === '') {
        patch.max_inscriptions = null;
      } else {
        const max = Number(raw);
        if (!Number.isInteger(max) || max < 1) {
          return res.status(400).json({ message: 'El cupo tiene que ser un número entero mayor que 0' });
        }
        patch.max_inscriptions = max;
      }
    }

    const eventDates = eventDatePatch(req.body, current);
    if (eventDates.error) return res.status(400).json({ message: eventDates.error });
    Object.assign(patch, eventDates.patch);

    const touchesDates = 'inscription_starts_at' in req.body || 'inscription_ends_at' in req.body;
    if (touchesDates) {
      const start = parseDateInput(
        'inscription_starts_at' in req.body ? req.body.inscription_starts_at : current.inscription_starts_at,
        'La fecha de inicio',
      );
      const end = parseDateInput(
        'inscription_ends_at' in req.body ? req.body.inscription_ends_at : current.inscription_ends_at,
        'La fecha de fin',
      );
      if (start.error) return res.status(400).json({ message: start.error });
      if (end.error) return res.status(400).json({ message: end.error });
      if ((start.value && !end.value) || (!start.value && end.value)) {
        return res.status(400).json({ message: 'Indica la fecha de inicio y la de fin de las inscripciones' });
      }
      if (start.value && end.value && new Date(start.value) >= new Date(end.value)) {
        return res.status(400).json({ message: 'La fecha de fin tiene que ser posterior a la de inicio' });
      }
      patch.inscription_starts_at = start.value;
      patch.inscription_ends_at = end.value;
    }

    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ message: 'No hay cambios que guardar' });
    }

    const { data: event, error } = await supabase
      .from('events')
      .update(patch)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;

    res.json({
      message: 'Evento actualizado correctamente',
      event: await presentEvent(event, { counts: true }),
    });
  } catch (error) {
    console.error('Error al actualizar evento:', error);
    res.status(500).json({ message: schemaErrorMessage(error, 'Error interno del servidor') });
  }
};

exports.uploadLogo = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No se ha proporcionado una imagen' });
    const eventId = req.params.id;
    let logoUrl;
    try {
      logoUrl = await uploadEventLogo(eventId, req.file);
    } catch (storageError) {
      console.error('No se pudo subir el logo a Storage, se guarda en disco:', storageError);
      logoUrl = saveToDisk(`event-${eventId}`, req.file);
    }
    const { data: event, error } = await supabase
      .from('events')
      .update({ logo_url: logoUrl })
      .eq('id', eventId)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!event) return res.status(404).json({ message: 'Evento no encontrado' });
    res.json({ message: 'Logotipo del evento actualizado', event: await presentEvent(event, { counts: true }) });
  } catch (error) {
    console.error('Error al subir el logotipo del evento:', error);
    res.status(500).json({ message: schemaErrorMessage(error, 'Error al subir el logotipo') });
  }
};

exports.deleteEvent = async (req, res) => {
  try {
    const { error } = await supabase.from('events').delete().eq('id', req.params.id);
    if (error) throw error;

    res.json({ message: 'Evento eliminado correctamente' });
  } catch (error) {
    console.error('Error al eliminar evento:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};
