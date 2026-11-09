const supabase = require('../database');

const PREINSCRITO_STATE = 'Pendiente de Confirmación';
const WAITLIST_STATE = 'Lista de Espera';
const INSCRITO_STATES = ['Confirmado - Pdte de Pago', 'Inscrito'];

function inscriptionAvailability(event, now = new Date()) {
  if (!Object.prototype.hasOwnProperty.call(event, 'inscription_starts_at')) {
    return { open: true, reason: 'legacy', message: 'Inscripciones abiertas' };
  }

  if (event.inscriptions_closed) {
    return { open: false, reason: 'closed', message: 'Las inscripciones están cerradas' };
  }

  const start = event.inscription_starts_at ? new Date(event.inscription_starts_at) : null;
  const end = event.inscription_ends_at ? new Date(event.inscription_ends_at) : null;

  if (!start || !end) {
    return {
      open: false,
      reason: 'unconfigured',
      message: 'El periodo de inscripción todavía no está configurado',
    };
  }
  if (now < start) {
    return { open: false, reason: 'before', message: 'Las inscripciones todavía no han comenzado' };
  }
  if (now > end) {
    return { open: false, reason: 'after', message: 'El periodo de inscripción ha finalizado' };
  }
  return { open: true, reason: 'open', message: 'Inscripciones abiertas' };
}

async function loadStateIds() {
  const { data, error } = await supabase.from('inscription_states').select('id, nombre');
  if (error) throw error;
  return Object.fromEntries((data || []).map((state) => [state.nombre, state.id]));
}

function emptyCounts() {
  return { preinscritos: 0, inscritos: 0, lista_espera: 0 };
}

function addCount(bucket, stateId, stateIds) {
  if (stateId === stateIds[PREINSCRITO_STATE]) bucket.preinscritos += 1;
  else if (INSCRITO_STATES.some((name) => stateIds[name] === stateId)) bucket.inscritos += 1;
  else if (stateId === stateIds[WAITLIST_STATE]) bucket.lista_espera += 1;
}

async function inscriptionCounts(eventId) {
  const byEvent = await inscriptionCountsForEvents([eventId]);
  return { ...byEvent[eventId], stateIds: await loadStateIds() };
}

async function inscriptionCountsForEvents(eventIds) {
  const stateIds = await loadStateIds();
  const byEvent = Object.fromEntries(eventIds.map((id) => [id, emptyCounts()]));
  if (eventIds.length === 0) return byEvent;

  const { data, error } = await supabase
    .from('inscriptions')
    .select('event_id, state_id')
    .in('event_id', eventIds);

  if (error) throw error;

  for (const row of data || []) {
    const bucket = byEvent[row.event_id];
    if (bucket) addCount(bucket, row.state_id, stateIds);
  }

  return byEvent;
}

function withAvailability(event) {
  const availability = inscriptionAvailability(event);
  return {
    ...event,
    inscripciones_abiertas: availability.open,
    inscripciones_mensaje: availability.message,
  };
}

module.exports = {
  PREINSCRITO_STATE,
  WAITLIST_STATE,
  INSCRITO_STATES,
  inscriptionAvailability,
  inscriptionCounts,
  inscriptionCountsForEvents,
  withAvailability,
};
