function isDeveloper(user) {
  return user?.role === 'desarrollador';
}

function isStaff(user) {
  return user?.role === 'administrador' || user?.role === 'desarrollador';
}

function maskTesting(event, user) {
  if (!event || isStaff(user)) return event;
  const next = { ...event };
  if (next.food_en_pruebas) next.food_ordering_enabled = false;
  if (next.games_en_pruebas) next.games_enabled = false;
  if (next.snacks_en_pruebas) next.snacks_enabled = false;
  if (next.manual_food_en_pruebas) next.manual_food_enabled = false;
  if (next.inscription_en_pruebas) {
    next.inscripciones_abiertas = false;
    next.inscripciones_mensaje = 'Inscripción no disponible';
  }
  return next;
}

function developerPreview(user, flag) {
  return isDeveloper(user) && flag === true;
}

function testingBlockReason(event, user) {
  if (!event) return { status: 404, message: 'Evento no encontrado' };
  if ((event.hidden || event.en_pruebas) && !isStaff(user)) {
    return { status: 404, message: 'Evento no encontrado' };
  }
  if ((event.en_pruebas || event.inscription_en_pruebas) && !isDeveloper(user)) {
    return { status: 403, message: 'La inscripción está en pruebas' };
  }
  return null;
}

module.exports = {
  isDeveloper,
  isStaff,
  developerPreview,
  maskTesting,
  testingBlockReason,
};
