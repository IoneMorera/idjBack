const supabase = require('../database');
const { sendInscriptionEmails } = require('../services/emailService');
const { pagoHotelFromValues, setHotelPayment } = require('../utils/hotelPayment');

async function loadFieldMeta(fieldIds) {
  const uniqueIds = [...new Set(fieldIds.filter(Boolean))];
  if (uniqueIds.length === 0) return {};

  const { data, error } = await supabase
    .from('form_fields')
    .select('id, label, field_type')
    .in('id', uniqueIds);

  if (error) throw error;
  return Object.fromEntries((data || []).map((field) => [field.id, field]));
}

function withFieldMeta(rows, meta) {
  return (rows || []).map((row) => {
    const field = meta[row.field_id];
    return {
      field_id: row.field_id,
      value: row.value,
      label: field?.label || '',
      field_type: field?.field_type || '',
    };
  });
}

async function enrichFieldValues(rows) {
  const meta = await loadFieldMeta((rows || []).map((row) => row.field_id));
  return withFieldMeta(rows, meta);
}

exports.getInscriptionStates = async (req, res) => {
  try {
    const { data: states, error } = await supabase
      .from('inscription_states')
      .select('*')
      .order('id');

    if (error) throw error;
    res.json({ states });
  } catch (error) {
    console.error('Error al obtener estados:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

exports.getMyInscription = async (req, res) => {
  try {
    const { eventId } = req.params;
    const userId = req.user.id;

    const { data: inscription, error } = await supabase
      .from('inscriptions')
      .select(`
        *,
        inscription_states ( nombre ),
        events ( nombre, mes, anio ),
        event_tariffs ( id, nombre, precio_total )
      `)
      .eq('user_id', userId)
      .eq('event_id', eventId)
      .maybeSingle();

    if (error) throw error;

    if (!inscription) {
      const { data: sinInscribir } = await supabase
        .from('inscription_states')
        .select('*')
        .eq('nombre', 'Sin inscribir')
        .single();

      return res.json({ inscription: null, state: sinInscribir });
    }

    const { data: fieldValues } = await supabase
      .from('inscription_field_values')
      .select('field_id, value')
      .eq('inscription_id', inscription.id);

    const values = await enrichFieldValues(fieldValues || []);

    const flat = {
      ...inscription,
      estado_nombre: inscription.inscription_states?.nombre,
      evento_nombre: inscription.events?.nombre,
      mes: inscription.events?.mes,
      anio: inscription.events?.anio,
      tariff_nombre: inscription.event_tariffs?.nombre,
      tariff_precio: inscription.event_tariffs?.precio_total,
      field_values: values,
      pago_hotel: pagoHotelFromValues(values),
    };
    delete flat.inscription_states;
    delete flat.events;
    delete flat.event_tariffs;

    res.json({ inscription: flat });
  } catch (error) {
    console.error('Error al obtener inscripción:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

exports.createInscription = async (req, res) => {
  try {
    const { eventId } = req.params;
    const userId = req.user.id;
    const { nombre, apellidos, telefono, email, dni, tariff_id, dynamicFields } = req.body;

    if (!nombre || !apellidos || !email || !dni) {
      return res.status(400).json({ message: 'Nombre, apellidos, email y DNI son obligatorios' });
    }

    const { data: event } = await supabase
      .from('events').select('*').eq('id', eventId).maybeSingle();
    if (!event) {
      return res.status(404).json({ message: 'Evento no encontrado' });
    }

    const { data: existing } = await supabase
      .from('inscriptions').select('id').eq('user_id', userId).eq('event_id', eventId).maybeSingle();
    if (existing) {
      return res.status(409).json({ message: 'Ya estás inscrito en este evento' });
    }

    const { data: pendienteState } = await supabase
      .from('inscription_states')
      .select('id')
      .eq('nombre', 'Pendiente de Confirmación')
      .single();

    const insertData = {
      user_id: userId,
      event_id: eventId,
      state_id: pendienteState.id,
      dni, nombre, apellidos,
      telefono: telefono || null,
      email,
    };
    if (tariff_id) insertData.tariff_id = Number(tariff_id);

    const { data: inscription, error } = await supabase
      .from('inscriptions')
      .insert(insertData)
      .select(`*, inscription_states ( nombre ), event_tariffs ( id, nombre, precio_total )`)
      .single();

    if (error) throw error;

    // Guardar campos dinámicos
    if (dynamicFields && typeof dynamicFields === 'object') {
      const rows = Object.entries(dynamicFields)
        .filter(([, value]) => value !== '' && value !== null && value !== undefined)
        .map(([fieldId, value]) => ({
          inscription_id: inscription.id,
          field_id: Number(fieldId),
          value: Array.isArray(value) ? JSON.stringify(value) : String(value),
        }));

      if (rows.length > 0) {
        const { error: fvError } = await supabase.from('inscription_field_values').insert(rows);
        if (fvError) console.error('Error al guardar campos dinámicos:', fvError);
      }
    }

    const flat = {
      ...inscription,
      estado_nombre: inscription.inscription_states?.nombre,
      tariff_nombre: inscription.event_tariffs?.nombre,
      tariff_precio: inscription.event_tariffs?.precio_total,
    };
    delete flat.inscription_states;
    delete flat.event_tariffs;

    const eventName = `${event.nombre} - ${event.mes} ${event.anio}`;
    await sendInscriptionEmails({ email, nombre, apellidos, telefono, dni, eventName });

    res.status(201).json({
      message: 'Inscripción realizada correctamente. Recibirás un email de confirmación.',
      inscription: flat,
    });
  } catch (error) {
    console.error('Error al crear inscripción:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

exports.updateMyInscription = async (req, res) => {
  try {
    const { eventId } = req.params;
    const userId = req.user.id;
    const { nombre, apellidos, telefono, email, dni, tariff_id, dynamicFields } = req.body;

    if (!nombre || !apellidos || !email || !dni) {
      return res.status(400).json({ message: 'Nombre, apellidos, email y DNI son obligatorios' });
    }

    // Buscar inscripción existente
    const { data: inscription, error: findError } = await supabase
      .from('inscriptions')
      .select('id, state_id, inscription_states ( nombre )')
      .eq('user_id', userId)
      .eq('event_id', eventId)
      .maybeSingle();

    if (findError) throw findError;
    if (!inscription) {
      return res.status(404).json({ message: 'No tienes inscripción en este evento' });
    }

    // Solo permitir edición si el estado es "Pendiente de Confirmación"
    if (inscription.inscription_states?.nombre !== 'Pendiente de Confirmación') {
      return res.status(403).json({ message: 'Solo puedes editar tu inscripción mientras tu estado sea "Pendiente de Confirmación"' });
    }

    const updateData = {
      nombre,
      apellidos,
      telefono: telefono || null,
      email,
      dni,
    };
    if (tariff_id !== undefined) updateData.tariff_id = tariff_id ? Number(tariff_id) : null;

    const { data: updated, error: updateError } = await supabase
      .from('inscriptions')
      .update(updateData)
      .eq('id', inscription.id)
      .select('*, inscription_states ( nombre ), event_tariffs ( id, nombre, precio_total )')
      .single();

    if (updateError) throw updateError;

    // Actualizar campos dinámicos: borrar los anteriores y reinsertar
    if (dynamicFields && typeof dynamicFields === 'object') {
      const { error: deleteError } = await supabase
        .from('inscription_field_values')
        .delete()
        .eq('inscription_id', inscription.id);

      if (deleteError) console.error('Error al borrar campos dinámicos anteriores:', deleteError);

      const rows = Object.entries(dynamicFields)
        .filter(([, value]) => value !== '' && value !== null && value !== undefined)
        .map(([fieldId, value]) => ({
          inscription_id: inscription.id,
          field_id: Number(fieldId),
          value: Array.isArray(value) ? JSON.stringify(value) : String(value),
        }));

      if (rows.length > 0) {
        const { error: insertError } = await supabase.from('inscription_field_values').insert(rows);
        if (insertError) console.error('Error al guardar campos dinámicos:', insertError);
      }
    }

    // Recuperar field_values actualizados
    const { data: fieldValues } = await supabase
      .from('inscription_field_values')
      .select('field_id, value')
      .eq('inscription_id', inscription.id);

    const values = await enrichFieldValues(fieldValues || []);

    const flat = {
      ...updated,
      estado_nombre: updated.inscription_states?.nombre,
      tariff_nombre: updated.event_tariffs?.nombre,
      tariff_precio: updated.event_tariffs?.precio_total,
      field_values: values,
      pago_hotel: pagoHotelFromValues(values),
    };
    delete flat.inscription_states;
    delete flat.event_tariffs;

    res.json({
      message: 'Inscripción actualizada correctamente',
      inscription: flat,
    });
  } catch (error) {
    console.error('Error al actualizar inscripción:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

exports.updateInscriptionState = async (req, res) => {
  try {
    const { id } = req.params;
    const { stateId } = req.body;

    const { data: state } = await supabase
      .from('inscription_states').select('id').eq('id', stateId).maybeSingle();
    if (!state) {
      return res.status(400).json({ message: 'Estado no válido' });
    }

    const { data: updated, error } = await supabase
      .from('inscriptions')
      .update({ state_id: stateId })
      .eq('id', id)
      .select(`
        *,
        inscription_states ( nombre ),
        events ( nombre, mes, anio ),
        users ( username )
      `)
      .single();

    if (error) throw error;

    const flat = {
      ...updated,
      estado_nombre: updated.inscription_states?.nombre,
      evento_nombre: updated.events?.nombre,
      mes: updated.events?.mes,
      anio: updated.events?.anio,
      username: updated.users?.username,
    };
    delete flat.inscription_states;
    delete flat.events;
    delete flat.users;

    res.json({ message: 'Estado de inscripción actualizado', inscription: flat });
  } catch (error) {
    console.error('Error al actualizar estado:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

exports.updateHotelPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const { pagoHotel } = req.body;

    if (typeof pagoHotel !== 'boolean') {
      return res.status(400).json({ message: 'Indica si la confirmación del hotel es sí o no' });
    }

    const { data: inscription, error: findError } = await supabase
      .from('inscriptions')
      .select('id, event_id')
      .eq('id', id)
      .maybeSingle();

    if (findError) throw findError;
    if (!inscription) {
      return res.status(404).json({ message: 'Inscripción no encontrada' });
    }

    await setHotelPayment(inscription.id, inscription.event_id, pagoHotel);

    res.json({
      message: 'Confirmación del Hotel actualizada',
      pago_hotel: pagoHotel,
    });
  } catch (error) {
    console.error('Error al actualizar la confirmación del hotel:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

exports.getAllInscriptions = async (req, res) => {
  try {
    const { eventId } = req.query;

    let query = supabase
      .from('inscriptions')
      .select(`
        *,
        inscription_states ( nombre ),
        events ( nombre, mes, anio ),
        users ( username ),
        event_tariffs ( id, nombre, precio_total )
      `)
      .order('created_at', { ascending: false });

    if (eventId) {
      query = query.eq('event_id', eventId);
    }

    const { data: rows, error } = await query;
    if (error) throw error;

    // Obtener valores dinámicos para todas las inscripciones
    const inscriptionIds = rows.map(r => r.id);
    let fieldValuesMap = {};

    if (inscriptionIds.length > 0) {
      const { data: allFieldValues, error: valuesError } = await supabase
        .from('inscription_field_values')
        .select('inscription_id, field_id, value')
        .in('inscription_id', inscriptionIds);

      if (valuesError) throw valuesError;

      const meta = await loadFieldMeta((allFieldValues || []).map((row) => row.field_id));
      for (const fv of allFieldValues || []) {
        const field = meta[fv.field_id];
        if (!fieldValuesMap[fv.inscription_id]) fieldValuesMap[fv.inscription_id] = [];
        fieldValuesMap[fv.inscription_id].push({
          field_id: fv.field_id,
          value: fv.value,
          label: field?.label || '',
          field_type: field?.field_type || '',
        });
      }
    }

    const inscriptions = rows.map(row => ({
      ...row,
      estado_nombre: row.inscription_states?.nombre,
      evento_nombre: row.events?.nombre,
      mes: row.events?.mes,
      anio: row.events?.anio,
      username: row.users?.username,
      tariff_nombre: row.event_tariffs?.nombre,
      tariff_precio: row.event_tariffs?.precio_total,
      field_values: fieldValuesMap[row.id] || [],
      pago_hotel: pagoHotelFromValues(fieldValuesMap[row.id] || []),
      inscription_states: undefined,
      events: undefined,
      users: undefined,
      event_tariffs: undefined,
    }));

    res.json({ inscriptions });
  } catch (error) {
    console.error('Error al obtener inscripciones:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};
