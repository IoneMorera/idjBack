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
  if (/manual_food_closed/i.test(message)) {
    return 'Falta aplicar la migración 015_manual_food_closed.sql en Supabase';
  }
  if (/cantidad/i.test(message)) {
    return 'Falta aplicar la migración 014_manual_food_quantity.sql en Supabase';
  }
  if (/manual_food|event_manual_food/i.test(message)) {
    return 'Falta aplicar la migración 011_manual_food.sql en Supabase';
  }
  return schemaErrorMessage(error, fallback);
}

function missingCantidad(error) {
  return /cantidad/i.test(`${error?.message || ''} ${error?.details || ''}`);
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

exports.setClosed = async (req, res) => {
  try {
    const { closed } = req.body;
    if (typeof closed !== 'boolean') {
      return res.status(400).json({ message: 'El campo closed debe ser true o false' });
    }
    const { data: event, error } = await supabase
      .from('events')
      .update({ manual_food_closed: closed })
      .eq('id', req.params.eventId)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!event) return res.status(404).json({ message: 'Evento no encontrado' });
    res.json({
      message: closed ? 'Pedido cerrado' : 'Pedido reabierto',
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
        .select('id, option_id, cantidad, created_at, users ( id, username, nombre, apellidos, email ), event_manual_food_options ( id, nombre, coste_adicional )')
        .eq('event_id', event.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('event_manual_food_requests')
        .select('id, texto, created_at, users ( id, username, nombre, apellidos, email )')
        .eq('event_id', event.id)
        .order('created_at', { ascending: false }),
    ]);
    if (optionsResult.error) throw optionsResult.error;
    let orderRows = ordersResult.data || [];
    if (ordersResult.error && missingCantidad(ordersResult.error)) {
      const fallback = await supabase
        .from('event_manual_food_orders')
        .select('id, option_id, created_at, users ( id, username, nombre, apellidos, email ), event_manual_food_options ( id, nombre, coste_adicional )')
        .eq('event_id', event.id)
        .order('created_at', { ascending: false });
      if (fallback.error) throw fallback.error;
      orderRows = (fallback.data || []).map((row) => ({ ...row, cantidad: 1 }));
    } else if (ordersResult.error) {
      throw ordersResult.error;
    }
    if (requestsResult.error) throw requestsResult.error;

    res.json({
      manual_food_enabled: event.manual_food_enabled === true,
      options: optionsResult.data || [],
      orders: orderRows.map((row) => ({
        id: row.id,
        created_at: row.created_at,
        cantidad: Number(row.cantidad) || 1,
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
      supabase.from('event_manual_food_orders').select('option_id, cantidad').eq('event_id', event.id).eq('user_id', req.user.id),
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
    let orderRows = ordersResult.data || [];
    if (ordersResult.error && missingCantidad(ordersResult.error)) {
      const fallback = await supabase
        .from('event_manual_food_orders')
        .select('option_id')
        .eq('event_id', event.id)
        .eq('user_id', req.user.id);
      if (fallback.error) throw fallback.error;
      orderRows = (fallback.data || []).map((row) => ({ ...row, cantidad: 1 }));
    } else if (ordersResult.error) {
      throw ordersResult.error;
    }
    if (requestsResult.error) throw requestsResult.error;
    if (communityResult.error) throw communityResult.error;
    res.json({
      closed: event.manual_food_closed === true,
      options: optionsResult.data || [],
      selected_ids: orderRows.map((row) => row.option_id),
      items: orderRows.map((row) => ({
        option_id: row.option_id,
        cantidad: Number(row.cantidad) || 1,
      })),
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

function parseOrderItems(body) {
  if (Array.isArray(body.items)) {
    const merged = new Map();
    for (const item of body.items) {
      const optionId = Number(item?.optionId ?? item?.option_id);
      const cantidad = Number(item?.cantidad ?? 1);
      if (!Number.isInteger(optionId) || !Number.isInteger(cantidad) || cantidad < 1 || cantidad > 20) {
        return { error: 'La cantidad de cada comida tiene que ser un número entre 1 y 20' };
      }
      merged.set(optionId, cantidad);
    }
    return { items: [...merged.entries()].map(([optionId, cantidad]) => ({ optionId, cantidad })) };
  }
  if (Array.isArray(body.optionIds)) {
    const ids = [...new Set(body.optionIds.map(Number))];
    if (ids.some((id) => !Number.isInteger(id))) return { error: 'Selecciona las comidas' };
    return { items: ids.map((optionId) => ({ optionId, cantidad: 1 })) };
  }
  return { error: 'Selecciona las comidas' };
}

exports.saveMine = async (req, res) => {
  try {
    const event = await assertManualFoodUser(req.user, req.params.eventId);
    if (event.manual_food_closed === true) {
      return res.status(403).json({ message: 'El pedido está cerrado y ya no se puede modificar' });
    }
    const parsed = parseOrderItems(req.body);
    if (parsed.error) return res.status(400).json({ message: parsed.error });
    const items = parsed.items;

    if (items.length) {
      const { data: options, error } = await supabase
        .from('event_manual_food_options')
        .select('id')
        .eq('event_id', event.id)
        .in('id', items.map((item) => item.optionId));
      if (error) throw error;
      if ((options || []).length !== items.length) {
        return res.status(400).json({ message: 'Hay una comida que no pertenece a este evento' });
      }
    }

    const { error: deleteError } = await supabase
      .from('event_manual_food_orders')
      .delete()
      .eq('event_id', event.id)
      .eq('user_id', req.user.id);
    if (deleteError) throw deleteError;

    if (items.length) {
      const { error } = await supabase.from('event_manual_food_orders').insert(
        items.map((item) => ({
          event_id: event.id,
          user_id: req.user.id,
          option_id: item.optionId,
          cantidad: item.cantidad,
        })),
      );
      if (error) throw error;
    }

    res.json({
      message: 'Comidas guardadas',
      selected_ids: items.map((item) => item.optionId),
      items: items.map((item) => ({ option_id: item.optionId, cantidad: item.cantidad })),
    });
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
