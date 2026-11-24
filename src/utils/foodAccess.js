const supabase = require('../database');
const { isStaff, developerPreview } = require('./access');

const VALID_DAYS = ['jueves', 'viernes', 'sabado', 'domingo'];
const VALID_MEALS = ['comida', 'cena'];

async function getEventById(eventId) {
  const { data: event, error } = await supabase
    .from('events')
    .select('*')
    .eq('id', eventId)
    .maybeSingle();

  if (error) throw error;
  return event;
}

async function getUserInscription(userId, eventId) {
  const { data: inscription, error } = await supabase
    .from('inscriptions')
    .select('id, state_id, inscription_states ( nombre )')
    .eq('user_id', userId)
    .eq('event_id', eventId)
    .maybeSingle();

  if (error) throw error;
  if (!inscription) return null;

  return {
    ...inscription,
    estado_nombre: inscription.inscription_states?.nombre,
  };
}

function isInscrito(inscription) {
  return inscription?.estado_nombre === 'Inscrito';
}

async function assertFoodOrderingEnabled(eventId, user) {
  const event = await getEventById(eventId);
  if (!event) {
    const err = new Error('Evento no encontrado');
    err.status = 404;
    throw err;
  }
  if (!event.food_ordering_enabled && !developerPreview(user, event.food_en_pruebas)) {
    const err = new Error('Los pedidos de comida no están habilitados para este evento');
    err.status = 403;
    throw err;
  }
  if (event.food_en_pruebas && !isStaff(user)) {
    const err = new Error('El pedido de comida está en pruebas');
    err.status = 403;
    throw err;
  }
  if ((event.hidden || event.en_pruebas) && !isStaff(user)) {
    const err = new Error('Evento no encontrado');
    err.status = 404;
    throw err;
  }
  return event;
}

async function assertUserCanOrderFood(user, eventId) {
  const event = await assertFoodOrderingEnabled(eventId, user);
  if (developerPreview(user, event.food_en_pruebas)) return null;
  const inscription = await getUserInscription(user.id, eventId);
  if (!isInscrito(inscription)) {
    const err = new Error('Debes estar inscrito con estado Inscrito para pedir comida');
    err.status = 403;
    throw err;
  }
  return inscription;
}

function validateDayMeal(day, meal) {
  if (!VALID_DAYS.includes(day)) {
    const err = new Error('Día no válido');
    err.status = 400;
    throw err;
  }
  if (!VALID_MEALS.includes(meal)) {
    const err = new Error('Horario no válido');
    err.status = 400;
    throw err;
  }
}

module.exports = {
  VALID_DAYS,
  VALID_MEALS,
  getEventById,
  getUserInscription,
  isInscrito,
  assertFoodOrderingEnabled,
  assertUserCanOrderFood,
  validateDayMeal,
};
