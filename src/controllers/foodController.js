const supabase = require('../database');
const { fetchAllDishes } = require('../services/nococinomasCatalog');
const {
  getEventById,
  assertFoodOrderingEnabled,
  assertUserCanOrderFood,
  validateDayMeal,
} = require('../utils/foodAccess');

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

exports.getDishes = async (req, res) => {
  try {
    const eventId = req.params.eventId;
    const event = await getEventById(eventId);
    if (!event) return res.status(404).json({ message: 'Evento no encontrado' });

    const isAdmin = req.user.role === 'administrador';

    if (!isAdmin) {
      await assertUserCanOrderFood(req.user.id, eventId);
    }

    let query = supabase
      .from('event_food_dishes')
      .select('*')
      .eq('event_id', eventId)
      .order('category')
      .order('name');

    if (!isAdmin) {
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
    await assertUserCanOrderFood(req.user.id, eventId);

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

    const orders = (items || []).map((row) => ({
      id: row.id,
      day: row.day,
      meal: row.meal,
      quantity: row.quantity,
      created_at: row.created_at,
      updated_at: row.updated_at,
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
    await assertUserCanOrderFood(req.user.id, eventId);

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

    await assertUserCanOrderFood(req.user.id, eventId);

    const { data: item } = await supabase
      .from('event_food_order_items')
      .select('id, user_id')
      .eq('id', itemId)
      .eq('event_id', eventId)
      .maybeSingle();

    if (!item) return res.status(404).json({ message: 'Línea de pedido no encontrada' });
    if (item.user_id !== req.user.id && req.user.role !== 'administrador') {
      return res.status(403).json({ message: 'No puedes eliminar este pedido' });
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

async function fetchAllOrdersForEvent(eventId) {
  const { data: items, error } = await supabase
    .from('event_food_order_items')
    .select(`
      id, day, meal, quantity, created_at,
      users ( id, username, nombre, apellidos, email ),
      event_food_dishes ( id, name, price, category )
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

    const orders = items.map((row) => ({
      id: row.id,
      day: row.day,
      meal: row.meal,
      quantity: row.quantity,
      created_at: row.created_at,
      user: row.users,
      dish: row.event_food_dishes,
    }));

    res.json({ orders });
  } catch (error) {
    console.error('Error al listar pedidos:', error);
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
