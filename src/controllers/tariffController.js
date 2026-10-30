const supabase = require('../database');

exports.getTariffs = async (req, res) => {
  try {
    const { eventId } = req.params;

    const { data: tariffs, error } = await supabase
      .from('event_tariffs')
      .select('*, event_tariff_items ( * )')
      .eq('event_id', eventId)
      .order('sort_order')
      .order('sort_order', { referencedTable: 'event_tariff_items' });

    if (error) throw error;
    res.json({ tariffs: tariffs || [] });
  } catch (error) {
    console.error('Error al obtener tarifas:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

exports.createTariff = async (req, res) => {
  try {
    const { eventId } = req.params;
    const { nombre, precio_total, items } = req.body;

    if (!nombre) {
      return res.status(400).json({ message: 'El nombre de la tarifa es obligatorio' });
    }

    const { data: existing } = await supabase
      .from('event_tariffs')
      .select('sort_order')
      .eq('event_id', eventId)
      .order('sort_order', { ascending: false })
      .limit(1);

    const nextOrder = existing && existing.length > 0 ? existing[0].sort_order + 1 : 0;

    const { data: tariff, error } = await supabase
      .from('event_tariffs')
      .insert({
        event_id: Number(eventId),
        nombre,
        precio_total: precio_total || 0,
        sort_order: nextOrder,
      })
      .select()
      .single();

    if (error) throw error;

    if (Array.isArray(items) && items.length > 0) {
      const rows = items
        .filter((item) => item.concepto && item.concepto.trim())
        .map((item, i) => ({
          tariff_id: tariff.id,
          concepto: item.concepto.trim(),
          importe: item.importe || 0,
          sort_order: i,
        }));

      if (rows.length > 0) {
        const { error: itemsError } = await supabase.from('event_tariff_items').insert(rows);
        if (itemsError) throw itemsError;
      }
    }

    const { data: full } = await supabase
      .from('event_tariffs')
      .select('*, event_tariff_items ( * )')
      .eq('id', tariff.id)
      .order('sort_order', { referencedTable: 'event_tariff_items' })
      .single();

    res.status(201).json({ message: 'Tarifa creada', tariff: full });
  } catch (error) {
    console.error('Error al crear tarifa:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

exports.updateTariff = async (req, res) => {
  try {
    const { tariffId } = req.params;
    const { nombre, precio_total, items } = req.body;

    const updates = {};
    if (nombre !== undefined) updates.nombre = nombre;
    if (precio_total !== undefined) updates.precio_total = precio_total;

    if (Object.keys(updates).length > 0) {
      const { error } = await supabase
        .from('event_tariffs')
        .update(updates)
        .eq('id', tariffId);
      if (error) throw error;
    }

    if (Array.isArray(items)) {
      await supabase.from('event_tariff_items').delete().eq('tariff_id', tariffId);

      const rows = items
        .filter((item) => item.concepto && item.concepto.trim())
        .map((item, i) => ({
          tariff_id: Number(tariffId),
          concepto: item.concepto.trim(),
          importe: item.importe || 0,
          sort_order: i,
        }));

      if (rows.length > 0) {
        const { error: itemsError } = await supabase.from('event_tariff_items').insert(rows);
        if (itemsError) throw itemsError;
      }
    }

    const { data: full } = await supabase
      .from('event_tariffs')
      .select('*, event_tariff_items ( * )')
      .eq('id', tariffId)
      .order('sort_order', { referencedTable: 'event_tariff_items' })
      .single();

    res.json({ message: 'Tarifa actualizada', tariff: full });
  } catch (error) {
    console.error('Error al actualizar tarifa:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

exports.deleteTariff = async (req, res) => {
  try {
    const { tariffId } = req.params;
    const { error } = await supabase.from('event_tariffs').delete().eq('id', tariffId);
    if (error) throw error;
    res.json({ message: 'Tarifa eliminada' });
  } catch (error) {
    console.error('Error al eliminar tarifa:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

exports.setHotelFoodEnabled = async (req, res) => {
  try {
    const eventId = req.params.id;
    const { enabled } = req.body;

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ message: 'El campo enabled debe ser true o false' });
    }

    const { data: event, error } = await supabase
      .from('events')
      .update({ hotel_food_enabled: enabled })
      .eq('id', eventId)
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!event) return res.status(404).json({ message: 'Evento no encontrado' });

    res.json({
      message: enabled ? 'Comida gestionada por el hotel activada' : 'Comida gestionada por el hotel desactivada',
      event,
    });
  } catch (error) {
    console.error('Error al actualizar comida del hotel:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};
