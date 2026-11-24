const supabase = require('../database');
const { getEventById, getUserInscription, isInscrito } = require('../utils/foodAccess');
const { isStaff, developerPreview } = require('../utils/access');
const { schemaErrorMessage } = require('../utils/schema');

function httpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function manualFoodError(error, fallback) {
  const message = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`;
  if (/manual_food|event_manual_food/i.test(message)) {
    return 'Falta aplicar la migración 011_manual_food.sql en Supabase';
  }
  return schemaErrorMessage(error, fallback);
}

function presentUser(row) {
  if (!row) return null;
  return {
    id: row.user_id || row.id,
    username: row.users?.username || row.username || '',
    nombre: row.nombre,
    apellidos: row.apellidos,
    email: row.email,
  };
}

async function assertManualFoodUser(user, eventId) {
  const event = await getEventById(eventId);
  if (!event) throw httpError('Evento no encontrado', 404);
  const preview = developerPreview(user, event.manual_food_en_pruebas);
  if ((event.hidden || event.en_pruebas) && !isStaff(user)) throw httpError('Evento no encontrado', 404);
  if (!event.manual_food_enabled && !preview) throw httpError('Las comidas manuales no están habilitadas para este evento', 403);
  if (event.manual_food_en_pruebas && !isStaff(user)) throw httpError('Las comidas manuales están en pruebas', 403);
  if (!preview) {
    const inscription = await getUserInscription(user.id, eventId);
    if (!isInscrito(inscription)) {
      throw httpError('Debes estar inscrito con estado Inscrito para pedir estas comidas', 403);
    }
  }
  return event;
}

exports.setEnabled = async (req, res) => {
  try {
    const { enabled } = req.body;
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ message: 'El campo enabled debe ser true o false' });
    }
    const { data: event, error } = await supabase
      .from('events')
      .update({ manual_food_enabled: enabled })
      .eq('id', req.params.eventId)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!event) return res.status(404).json({ message: 'Evento no encontrado' });
    res.json({
      message: enabled ? 'Comidas manuales activadas' : 'Comidas manuales desactivadas',
      event,
    });
  } catch (error) {
    console.error('Error al actualizar comidas manuales:', error);
    res.status(500).json({ message: manualFoodError(error, 'Error interno del servidor') });
  }
};

exports.getOptions = async (req, res) => {
  try {
    const event = await getEventById(req.params.eventId);
    if (!event) return res.status(404).json({ message: 'Evento no encontrado' });
    const { data, error } = await supabase
      .from('event_manual_food_options')
      .select('id, nombre, coste_adicional, sort_order')
      .eq('event_id', event.id)
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true });
    if (error) throw error;
    res.json({ manual_food_enabled: event.manual_food_enabled === true, options: data || [] });
  } catch (error) {
    console.error('Error al listar comidas manuales:', error);
    res.status(500).json({ message: manualFoodError(error, 'Error interno del servidor') });
  }
};

exports.createOption = async (req, res) => {
  try {
    const event = await getEventById(req.params.eventId);
    if (!event) return res.status(404).json({ message: 'Evento no encontrado' });
    const nombre = String(req.body.nombre || '').trim();
    const coste = req.body.coste_adicional == null || req.body.coste_adicional === ''
      ? 0
      : Number(req.body.coste_adicional);
    if (!nombre) return res.status(400).json({ message: 'Indica el nombre de la comida' });
    if (!Number.isFinite(coste) || coste < 0) {
      return res.status(400).json({ message: 'El coste adicional no es válido' });
    }
    const { count } = await supabase
      .from('event_manual_food_options')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', event.id);
    const { data, error } = await supabase
      .from('event_manual_food_options')
      .insert({ event_id: event.id, nombre, coste_adicional: coste, sort_order: count || 0 })
      .select('id, nombre, coste_adicional, sort_order')
      .single();
    if (error) throw error;
    res.status(201).json({ message: 'Opción añadida', option: data });
  } catch (error) {
    console.error('Error al crear comida manual:', error);
    res.status(500).json({ message: manualFoodError(error, 'Error interno del servidor') });
  }
};

exports.updateOption = async (req, res) => {
  try {
    const nombre = String(req.body.nombre || '').trim();
    const coste = Number(req.body.coste_adicional ?? 0);
    if (!nombre) return res.status(400).json({ message: 'Indica el nombre de la comida' });
    if (!Number.isFinite(coste) || coste < 0) {
      return res.status(400).json({ message: 'El coste adicional no es válido' });
    }
    const { data, error } = await supabase
      .from('event_manual_food_options')
      .update({ nombre, coste_adicional: coste })
      .eq('id', req.params.optionId)
      .eq('event_id', req.params.eventId)
      .select('id, nombre, coste_adicional, sort_order')
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ message: 'Opción no encontrada' });
    res.json({ message: 'Opción actualizada', option: data });
  } catch (error) {
    console.error('Error al actualizar comida manual:', error);
    res.status(500).json({ message: manualFoodError(error, 'Error interno del servidor') });
  }
};

exports.deleteOption = async (req, res) => {
  try {
    const { error } = await supabase
      .from('event_manual_food_options')
      .delete()
      .eq('id', req.params.optionId)
      .eq('event_id', req.params.eventId);
    if (error) throw error;
    res.json({ message: 'Opción eliminada' });
  } catch (error) {
    console.error('Error al eliminar comida manual:', error);
    res.status(500).json({ message: manualFoodError(error, 'Error interno del servidor') });
  }
};

exports.getAdminSummary = async (req, res) => {
  try {
    const event = await getEventById(req.params.eventId);
    if (!event) return res.status(404).json({ message: 'Evento no encontrado' });

    const [optionsResult, ordersResult, requestsResult] = await Promise.all([
      supabase
        .from('event_manual_food_options')
        .select('id, nombre, coste_adicional, sort_order')
        .eq('event_id', event.id)
        .order('sort_order'),
      supabase
        .from('event_manual_food_orders')
        .select('id, option_id, created_at, users ( id, username, nombre, apellidos, email ), event_manual_food_options ( id, nombre, coste_adicional )')
        .eq('event_id', event.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('event_manual_food_requests')
        .select('id, texto, created_at, users ( id, username, nombre, apellidos, email )')
        .eq('event_id', event.id)
        .order('created_at', { ascending: false }),
    ]);
    if (optionsResult.error) throw optionsResult.error;
    if (ordersResult.error) throw ordersResult.error;
    if (requestsResult.error) throw requestsResult.error;

    res.json({
      manual_food_enabled: event.manual_food_enabled === true,
      options: optionsResult.data || [],
      orders: (ordersResult.data || []).map((row) => ({
        id: row.id,
        created_at: row.created_at,
        option: row.event_manual_food_options,
        user: presentUser(row.users),
      })),
      requests: (requestsResult.data || []).map((row) => ({
        id: row.id,
        texto: row.texto,
        created_at: row.created_at,
        user: presentUser(row.users),
      })),
    });
  } catch (error) {
    console.error('Error al resumir comidas manuales:', error);
    res.status(500).json({ message: manualFoodError(error, 'Error interno del servidor') });
  }
};

exports.getMine = async (req, res) => {
  try {
    const event = await assertManualFoodUser(req.user, req.params.eventId);
    const [optionsResult, ordersResult, requestsResult, communityResult] = await Promise.all([
      supabase
        .from('event_manual_food_options')
        .select('id, nombre, coste_adicional, sort_order')
        .eq('event_id', event.id)
        .order('sort_order'),
      supabase.from('event_manual_food_orders').select('option_id').eq('event_id', event.id).eq('user_id', req.user.id),
      supabase
        .from('event_manual_food_requests')
        .select('id, texto, created_at')
        .eq('event_id', event.id)
        .eq('user_id', req.user.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('event_manual_food_orders')
        .select('option_id, users ( id, username, nombre, apellidos )')
        .eq('event_id', event.id),
    ]);
    if (optionsResult.error) throw optionsResult.error;
    if (ordersResult.error) throw ordersResult.error;
    if (requestsResult.error) throw requestsResult.error;
    if (communityResult.error) throw communityResult.error;
    res.json({
      options: optionsResult.data || [],
      selected_ids: (ordersResult.data || []).map((row) => row.option_id),
      requests: requestsResult.data || [],
      community: (communityResult.data || []).map((row) => ({
        option_id: row.option_id,
        user: presentUser(row.users),
      })),
    });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error('Error al cargar comidas manuales del usuario:', error);
    res.status(status).json({ message: manualFoodError(error, 'Error interno del servidor') });
  }
};

exports.saveMine = async (req, res) => {
  try {
    const event = await assertManualFoodUser(req.user, req.params.eventId);
    const optionIds = Array.isArray(req.body.optionIds) ? [...new Set(req.body.optionIds.map(Number))] : null;
    if (!optionIds || optionIds.some((id) => !Number.isInteger(id))) {
      return res.status(400).json({ message: 'Selecciona las comidas' });
    }

    if (optionIds.length) {
      const { data: options, error } = await supabase
        .from('event_manual_food_options')
        .select('id')
        .eq('event_id', event.id)
        .in('id', optionIds);
      if (error) throw error;
      if ((options || []).length !== optionIds.length) {
        return res.status(400).json({ message: 'Hay una comida que no pertenece a este evento' });
      }
    }

    const { error: deleteError } = await supabase
      .from('event_manual_food_orders')
      .delete()
      .eq('event_id', event.id)
      .eq('user_id', req.user.id);
    if (deleteError) throw deleteError;

    if (optionIds.length) {
      const { error } = await supabase.from('event_manual_food_orders').insert(
        optionIds.map((optionId) => ({ event_id: event.id, user_id: req.user.id, option_id: optionId })),
      );
      if (error) throw error;
    }

    res.json({ message: 'Comidas guardadas', selected_ids: optionIds });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error('Error al guardar comidas manuales:', error);
    res.status(status).json({ message: manualFoodError(error, 'Error interno del servidor') });
  }
};

exports.addRequest = async (req, res) => {
  try {
    const event = await assertManualFoodUser(req.user, req.params.eventId);
    const texto = String(req.body.texto || '').trim();
    if (!texto) return res.status(400).json({ message: 'Escribe la petición' });
    if (texto.length > 500) return res.status(400).json({ message: 'La petición es demasiado larga' });
    const { data, error } = await supabase
      .from('event_manual_food_requests')
      .insert({ event_id: event.id, user_id: req.user.id, texto })
      .select('id, texto, created_at')
      .single();
    if (error) throw error;
    res.status(201).json({ message: 'Petición enviada', request: data });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error('Error al pedir comida manual:', error);
    res.status(status).json({ message: manualFoodError(error, 'Error interno del servidor') });
  }
};

exports.deleteRequest = async (req, res) => {
  try {
    const event = await assertManualFoodUser(req.user, req.params.eventId);
    const { error } = await supabase
      .from('event_manual_food_requests')
      .delete()
      .eq('id', req.params.requestId)
      .eq('event_id', event.id)
      .eq('user_id', req.user.id);
    if (error) throw error;
    res.json({ message: 'Petición eliminada' });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error('Error al borrar petición de comida manual:', error);
    res.status(status).json({ message: manualFoodError(error, 'Error interno del servidor') });
  }
};
