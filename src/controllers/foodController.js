const supabase = require('../database');
const { fetchAllDishes, resolveProductIds } = require('../services/nococinomasCatalog');
const {
  getEventById,
  assertFoodOrderingEnabled,
  assertUserCanOrderFood,
  validateDayMeal,
} = require('../utils/foodAccess');
const { isStaff, isDeveloper } = require('../utils/access');
const { isMissingSchema } = require('../utils/schema');

exports.setFoodOrderingEnabled = async (req, res) => {
  try {
    const eventId = req.params.id;
    const { enabled } = req.body;

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ message: 'El campo enabled debe ser true o false' });
    }

    const { data: event, error } = await supabase
      .from('events')
      .update({ food_ordering_enabled: enabled })
      .eq('id', eventId)
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!event) return res.status(404).json({ message: 'Evento no encontrado' });

    res.json({ message: enabled ? 'Pedidos de comida habilitados' : 'Pedidos de comida deshabilitados', event });
  } catch (error) {
    console.error('Error al actualizar pedidos de comida:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

exports.syncCatalog = async (req, res) => {
  const wantsStream = String(req.query.stream || '') === '1'
    || (req.headers.accept || '').includes('text/event-stream');

  const sendEvent = (payload) => {
    if (!wantsStream) return;
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  try {
    const eventId = req.params.eventId;
    const event = await getEventById(eventId);
    if (!event) {
      return res.status(404).json({ message: 'Evento no encontrado' });
    }

    if (wantsStream) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      });
      if (typeof res.flushHeaders === 'function') res.flushHeaders();
    }

    const dishes = await fetchAllDishes((progress) => sendEvent(progress));
    const externalUrls = dishes.map((d) => d.external_url);

    sendEvent({
      phase: 'saving',
      message: `Guardando ${dishes.length} platos…`,
      percent: 85,
      dishesSoFar: dishes.length,
    });

    for (let i = 0; i < dishes.length; i++) {
      const dish = dishes[i];
      const { error } = await supabase.from('event_food_dishes').upsert(
        {
          event_id: eventId,
          external_url: dish.external_url,
          name: dish.name,
          price: dish.price,
          image_url: dish.image_url,
          category: dish.category,
          active: true,
        },
        { onConflict: 'event_id,external_url' },
      );
      if (error) throw error;

      if (wantsStream && (i % 25 === 0 || i === dishes.length - 1)) {
        sendEvent({
          phase: 'saving',
          message: `Guardando platos… (${i + 1}/${dishes.length})`,
          percent: 85 + Math.round(((i + 1) / dishes.length) * 12),
          current: i + 1,
          total: dishes.length,
          dishesSoFar: dishes.length,
        });
      }
    }

    const { data: existing } = await supabase
      .from('event_food_dishes')
      .select('id, external_url')
      .eq('event_id', eventId);

    const toDeactivate = (existing || []).filter((row) => !externalUrls.includes(row.external_url));
    if (toDeactivate.length > 0) {
      const { error: deactivateError } = await supabase
        .from('event_food_dishes')
        .update({ active: false })
        .in('id', toDeactivate.map((r) => r.id));
      if (deactivateError) throw deactivateError;
    }

    const { count } = await supabase
      .from('event_food_dishes')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .eq('active', true);

    const result = {
      phase: 'done',
      message: 'Catálogo sincronizado desde NoCocinoMás',
      percent: 100,
      synced: dishes.length,
      activeCount: count ?? dishes.length,
      dishesSoFar: count ?? dishes.length,
    };

    if (wantsStream) {
      sendEvent(result);
      return res.end();
    }

    res.json(result);
  } catch (error) {
    console.error('Error al sincronizar catálogo:', error);
    const message = error.message || 'Error al sincronizar el catálogo';
    const status = message.includes('NoCocinoMás') ? 502 : 500;

    if (wantsStream) {
      try {
        sendEvent({ phase: 'error', message, percent: 0 });
        return res.end();
      } catch {
        // ignore write errors after client disconnect
      }
    }

    if (!res.headersSent) {
      res.status(status).json({ message });
    }
  }
};

exports.resolveProductIds = async (req, res) => {
  try {
    const eventId = req.params.eventId;
    const event = await getEventById(eventId);
    if (!event) return res.status(404).json({ message: 'Evento no encontrado' });

    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const cleaned = items
      .filter((item) => item && (item.name || item.url))
      .slice(0, 80)
      .map((item) => ({
        name: String(item.name || '').trim(),
        url: String(item.url || '').trim(),
      }));

    const resolved = await resolveProductIds(cleaned);
    res.json({ items: resolved });
  } catch (error) {
    console.error('Error al resolver IDs de NoCocinoMás:', error);
    res.status(500).json({ message: 'Error al buscar los productos en NoCocinoMás' });
  }
};

exports.getDishes = async (req, res) => {
  try {
    const eventId = req.params.eventId;
    const event = await getEventById(eventId);
    if (!event) return res.status(404).json({ message: 'Evento no encontrado' });

    const staff = isStaff(req.user);

    if (!staff) {
      await assertUserCanOrderFood(req.user, eventId);
    }

    let query = supabase
      .from('event_food_dishes')
      .select('*')
      .eq('event_id', eventId)
      .order('category')
      .order('name');

    if (!staff) {
      query = query.eq('active', true);
    }

    const { data: dishes, error } = await query;
    if (error) throw error;

    res.json({ dishes: dishes || [], food_ordering_enabled: event.food_ordering_enabled });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error('Error al obtener platos:', error);
    res.status(status).json({ message: error.message || 'Error interno del servidor' });
  }
};

exports.getMyOrders = async (req, res) => {
  try {
    const eventId = req.params.eventId;
    await assertUserCanOrderFood(req.user, eventId);

    const { data: items, error } = await supabase
      .from('event_food_order_items')
      .select(`
        id, day, meal, quantity, created_at, updated_at,
        event_food_dishes ( id, name, price, category, image_url )
      `)
      .eq('event_id', eventId)
      .eq('user_id', req.user.id)
      .order('day')
      .order('meal')
      .order('id');

    if (error) throw error;

    const purchasedIds = await fetchPurchasedDishIds(eventId);
    const orders = (items || []).map((row) => ({
      id: row.id,
      day: row.day,
      meal: row.meal,
      quantity: row.quantity,
      created_at: row.created_at,
      updated_at: row.updated_at,
      locked: purchasedIds.has(Number(row.event_food_dishes?.id)),
      dish: row.event_food_dishes,
    }));

    res.json({ orders });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error('Error al obtener pedidos:', error);
    res.status(status).json({ message: error.message || 'Error interno del servidor' });
  }
};

exports.upsertOrder = async (req, res) => {
  try {
    const eventId = req.params.eventId;
    await assertUserCanOrderFood(req.user, eventId);

    const { dishId, day, meal, quantity } = req.body;

    if (!dishId || !day || !meal) {
      return res.status(400).json({ message: 'dishId, day y meal son obligatorios' });
    }

    validateDayMeal(day, meal);

    const qty = Number(quantity ?? 1);
    if (!Number.isInteger(qty) || qty < 1) {
      return res.status(400).json({ message: 'La cantidad debe ser un entero mayor o igual a 1' });
    }

    const { data: dish } = await supabase
      .from('event_food_dishes')
      .select('id')
      .eq('id', dishId)
      .eq('event_id', eventId)
      .eq('active', true)
      .maybeSingle();

    if (!dish) {
      return res.status(404).json({ message: 'Plato no encontrado en el catálogo del evento' });
    }

    const purchasedIds = await fetchPurchasedDishIds(eventId);
    if (purchasedIds.has(Number(dishId))) {
      const { data: current } = await supabase
        .from('event_food_order_items')
        .select('quantity')
        .eq('event_id', eventId)
        .eq('user_id', req.user.id)
        .eq('dish_id', dishId)
        .eq('day', day)
        .eq('meal', meal)
        .maybeSingle();
      if (current && qty < current.quantity) {
        return res.status(409).json({ message: 'Este plato ya se ha pedido y no se puede quitar' });
      }
    }

    const { data: item, error } = await supabase
      .from('event_food_order_items')
      .upsert(
        {
          event_id: eventId,
          user_id: req.user.id,
          dish_id: dishId,
          day,
          meal,
          quantity: qty,
        },
        { onConflict: 'event_id,user_id,dish_id,day,meal' },
      )
      .select(`
        id, day, meal, quantity,
        event_food_dishes ( id, name, price, category, image_url )
      `)
      .single();

    if (error) throw error;

    res.json({
      message: 'Pedido guardado',
      order: {
        id: item.id,
        day: item.day,
        meal: item.meal,
        quantity: item.quantity,
        locked: purchasedIds.has(Number(dishId)),
        dish: item.event_food_dishes,
      },
    });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error('Error al guardar pedido:', error);
    res.status(status).json({ message: error.message || 'Error interno del servidor' });
  }
};

exports.deleteOrderItem = async (req, res) => {
  try {
    const eventId = req.params.eventId;
    const itemId = req.params.itemId;

    await assertUserCanOrderFood(req.user, eventId);

    const { data: item } = await supabase
      .from('event_food_order_items')
      .select('id, user_id, dish_id')
      .eq('id', itemId)
      .eq('event_id', eventId)
      .maybeSingle();

    if (!item) return res.status(404).json({ message: 'Línea de pedido no encontrada' });
    if (item.user_id !== req.user.id && !isStaff(req.user)) {
      return res.status(403).json({ message: 'No puedes eliminar este pedido' });
    }

    const purchasedIds = await fetchPurchasedDishIds(eventId);
    if (purchasedIds.has(Number(item.dish_id))) {
      return res.status(409).json({ message: 'Este plato ya se ha pedido y no se puede eliminar' });
    }

    const { error } = await supabase.from('event_food_order_items').delete().eq('id', itemId);
    if (error) throw error;

    res.json({ message: 'Línea eliminada' });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error('Error al eliminar pedido:', error);
    res.status(status).json({ message: error.message || 'Error interno del servidor' });
  }
};

async function fetchPurchasedDishIds(eventId) {
  const { data, error } = await supabase
    .from('event_food_purchased_dishes')
    .select('dish_id')
    .eq('event_id', eventId);
  if (error) {
    if (isMissingSchema(error)) return new Set();
    throw error;
  }
  return new Set((data || []).map((row) => Number(row.dish_id)));
}

exports.markPurchasedDishes = async (req, res) => {
  try {
    const eventId = Number(req.params.eventId);
    const names = Array.isArray(req.body?.names)
      ? req.body.names.map((name) => String(name || '').trim()).filter(Boolean)
      : [];
    if (!Number.isInteger(eventId) || names.length === 0) {
      return res.status(400).json({ message: 'Indica los platos que se han pedido' });
    }

    const event = await getEventById(eventId);
    if (!event) return res.status(404).json({ message: 'Evento no encontrado' });

    const wanted = new Set(names.map((name) => name.toLowerCase()));
    const { data: dishes, error: dishError } = await supabase
      .from('event_food_dishes')
      .select('id, name')
      .eq('event_id', eventId);
    if (dishError) throw dishError;

    const rows = (dishes || [])
      .filter((dish) => wanted.has(String(dish.name || '').trim().toLowerCase()))
      .map((dish) => ({ event_id: eventId, dish_id: dish.id }));

    if (!rows.length) {
      return res.json({ purchased: 0 });
    }

    const { error } = await supabase
      .from('event_food_purchased_dishes')
      .upsert(rows, { onConflict: 'event_id,dish_id' });
    if (error) {
      if (isMissingSchema(error)) {
        return res.status(503).json({ message: 'Falta aplicar la migración de platos pedidos' });
      }
      throw error;
    }

    res.json({ purchased: rows.length });
  } catch (error) {
    console.error('Error al marcar platos pedidos:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

async function fetchPaidUserIds(eventId) {
  const { data, error } = await supabase
    .from('event_food_payments')
    .select('user_id, paid')
    .eq('event_id', eventId);
  if (error) {
    if (isMissingSchema(error)) return null;
    throw error;
  }
  return (data || []).filter((row) => row.paid).map((row) => row.user_id);
}

async function fetchAllOrdersForEvent(eventId) {
  const { data: items, error } = await supabase
    .from('event_food_order_items')
    .select(`
      id, day, meal, quantity, created_at,
      users ( id, username, nombre, apellidos, email ),
      event_food_dishes ( id, name, price, category, image_url, external_url )
    `)
    .eq('event_id', eventId)
    .order('day')
    .order('meal')
    .order('id');

  if (error) throw error;
  return items || [];
}

exports.getAllOrders = async (req, res) => {
  try {
    const eventId = req.params.eventId;
    const event = await getEventById(eventId);
    if (!event) return res.status(404).json({ message: 'Evento no encontrado' });

    const items = await fetchAllOrdersForEvent(eventId);
    const paidUserIds = await fetchPaidUserIds(eventId);

    const orders = items.map((row) => ({
      id: row.id,
      day: row.day,
      meal: row.meal,
      quantity: row.quantity,
      created_at: row.created_at,
      user: row.users,
      dish: row.event_food_dishes,
    }));

    res.json({ orders, paid_user_ids: paidUserIds });
  } catch (error) {
    console.error('Error al listar pedidos:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

exports.setFoodPayment = async (req, res) => {
  try {
    const eventId = Number(req.params.eventId);
    const userId = Number(req.body.userId);
    const { paid } = req.body;
    if (!Number.isInteger(eventId) || !Number.isInteger(userId) || typeof paid !== 'boolean') {
      return res.status(400).json({ message: 'Indica el usuario y si ha pagado' });
    }

    const event = await getEventById(eventId);
    if (!event) return res.status(404).json({ message: 'Evento no encontrado' });

    const { error } = await supabase
      .from('event_food_payments')
      .upsert({
        event_id: eventId,
        user_id: userId,
        paid,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'event_id,user_id' });
    if (error) {
      if (isMissingSchema(error)) {
        return res.status(503).json({ message: 'Falta aplicar la migración de pagos de comida' });
      }
      throw error;
    }

    res.json({ user_id: userId, paid });
  } catch (error) {
    console.error('Error al guardar el pago de comida:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

exports.getMyOrdersHistory = async (req, res) => {
  try {
    const baseQuery = () => supabase
      .from('event_food_order_items')
      .select(`
        id, event_id, day, meal, quantity,
        events ( id, nombre, mes, anio, starts_on, ends_on, hidden, en_pruebas, food_en_pruebas ),
        event_food_dishes ( id, name, price )
      `)
      .eq('user_id', req.user.id)
      .order('event_id')
      .order('day')
      .order('meal');

    let { data: items, error } = await baseQuery();
    if (error && /starts_on|ends_on/i.test(`${error.message || ''} ${error.details || ''}`)) {
      const retry = await supabase
        .from('event_food_order_items')
        .select(`
          id, event_id, day, meal, quantity,
          events ( id, nombre, mes, anio, hidden, en_pruebas, food_en_pruebas ),
          event_food_dishes ( id, name, price )
        `)
        .eq('user_id', req.user.id)
        .order('event_id')
        .order('day')
        .order('meal');
      items = retry.data;
      error = retry.error;
    }
    if (error && /en_pruebas/i.test(error.message || '')) {
      const retry = await supabase
        .from('event_food_order_items')
        .select(`
          id, event_id, day, meal, quantity,
          events ( id, nombre, mes, anio ),
          event_food_dishes ( id, name, price )
        `)
        .eq('user_id', req.user.id)
        .order('event_id')
        .order('day')
        .order('meal');
      items = retry.data;
      error = retry.error;
    }

    if (error) throw error;

    const byEvent = new Map();
    for (const row of items || []) {
      const eventRow = Array.isArray(row.events) ? row.events[0] : row.events;
      if (!eventRow) continue;
      if (!isDeveloper(req.user) && (eventRow.hidden || eventRow.en_pruebas || eventRow.food_en_pruebas)) continue;
      if (!byEvent.has(row.event_id)) {
        byEvent.set(row.event_id, {
          event: eventRow,
          orders: [],
        });
      }
      byEvent.get(row.event_id).orders.push({
        id: row.id,
        day: row.day,
        meal: row.meal,
        quantity: row.quantity,
        dish: row.event_food_dishes,
      });
    }

    const monthIndex = {
      enero: 1,
      febrero: 2,
      marzo: 3,
      abril: 4,
      mayo: 5,
      junio: 6,
      julio: 7,
      agosto: 8,
      septiembre: 9,
      setiembre: 9,
      octubre: 10,
      noviembre: 11,
      diciembre: 12,
    };
    const recency = (eventRow) => {
      const month = monthIndex[String(eventRow?.mes || '').trim().toLowerCase()] || 0;
      return (Number(eventRow?.anio) || 0) * 100 + month;
    };

    res.json({
      events: [...byEvent.values()].sort((a, b) => recency(b.event) - recency(a.event)),
    });
  } catch (error) {
    console.error('Error al obtener el historial de comida:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

exports.exportOrdersCsv = async (req, res) => {
  try {
    const eventId = req.params.eventId;
    const event = await getEventById(eventId);
    if (!event) return res.status(404).json({ message: 'Evento no encontrado' });

    const items = await fetchAllOrdersForEvent(eventId);

    const header = ['Usuario', 'Email', 'Plato', 'Categoría', 'Día', 'Horario', 'Cantidad', 'Precio unitario'];
    const rows = items.map((row) => [
      row.users ? `${row.users.nombre} ${row.users.apellidos} (@${row.users.username})` : '',
      row.users?.email ?? '',
      row.event_food_dishes?.name ?? '',
      row.event_food_dishes?.category ?? '',
      row.day,
      row.meal,
      String(row.quantity),
      row.event_food_dishes?.price != null ? String(row.event_food_dishes.price) : '',
    ]);

    const escape = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = [header, ...rows].map((line) => line.map(escape).join(';')).join('\n');

    const filename = `pedidos-comida-${event.nombre}-${event.mes}-${event.anio}.csv`.replace(/\s+/g, '-');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(`\uFEFF${csv}`);
  } catch (error) {
    console.error('Error al exportar pedidos:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};
