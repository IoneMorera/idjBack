const supabase = require('../database');
const { sendInscriptionEmails } = require('../services/emailService');
const { HOTEL_PAYMENT_BLOCK, HOTEL_PAYMENT_LABEL, pagoHotelFromValues, setHotelPayment } = require('../utils/hotelPayment');
const {
  FIRST_PAYMENT_LABEL,
  isPagoAplazadoName,
  primerPagoFromValues,
  protectedFieldIds,
  setFirstPayment,
} = require('../utils/firstPayment');
const {
  PREINSCRITO_STATE,
  WAITLIST_STATE,
  inscriptionAvailability,
} = require('../utils/inscriptionWindow');

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

function formatPrice(value) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(Number(value));
}

async function inscriptionFormFields(eventId, dynamicFields) {
  const { data: blocks, error } = await supabase
    .from('form_blocks')
    .select('titulo, sort_order, form_fields ( id, label, sort_order )')
    .eq('event_id', eventId)
    .order('sort_order');

  if (error) throw error;

  const answers = dynamicFields && typeof dynamicFields === 'object' ? dynamicFields : {};
  const campos = [];
  const sortedBlocks = [...(blocks || [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  for (const block of sortedBlocks) {
    if (block.titulo === HOTEL_PAYMENT_BLOCK) continue;
    const fields = [...(block.form_fields || [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    for (const field of fields) {
      if (field.label === HOTEL_PAYMENT_LABEL || field.label === FIRST_PAYMENT_LABEL) continue;
      const value = answers[String(field.id)] ?? answers[field.id];
      campos.push({ label: field.label, value: value ?? '' });
    }
  }

  return campos;
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
    if (!event || (event.hidden && req.user.role !== 'administrador')) {
      return res.status(404).json({ message: 'Evento no encontrado' });
    }

    const availability = inscriptionAvailability(event);
    if (!availability.open) {
      return res.status(403).json({ message: availability.message });
    }

    const { data: existing } = await supabase
      .from('inscriptions').select('id').eq('user_id', userId).eq('event_id', eventId).maybeSingle();
    if (existing) {
      return res.status(409).json({ message: 'Ya estás inscrito en este evento' });
    }

    const { data: pendingState, error: stateError } = await supabase
      .from('inscription_states')
      .select('id')
      .eq('nombre', PREINSCRITO_STATE)
      .maybeSingle();
    if (stateError) throw stateError;
    if (!pendingState) {
      return res.status(500).json({ message: `Falta el estado "${PREINSCRITO_STATE}" en la base de datos` });
    }

    const insertData = {
      user_id: userId,
      event_id: eventId,
      state_id: pendingState.id,
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
    const tarifa = flat.tariff_nombre || '';
    const precio = flat.tariff_precio != null ? formatPrice(flat.tariff_precio) : '';
    const campos = await inscriptionFormFields(eventId, dynamicFields);
    await sendInscriptionEmails({
      eventId: event.id,
      email,
      nombre,
      apellidos,
      telefono,
      dni,
      usuario: req.user.username,
      eventName,
      mes: event.mes,
      anio: event.anio,
      estado: PREINSCRITO_STATE,
      tarifa,
      precio,
      campos,
    });

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

    const editableStates = [PREINSCRITO_STATE, WAITLIST_STATE];
    if (!editableStates.includes(inscription.inscription_states?.nombre)) {
      return res.status(403).json({ message: 'Solo puedes editar tu inscripción mientras esté pendiente de confirmación o en lista de espera' });
    }

    const { data: event } = await supabase.from('events').select('*').eq('id', eventId).maybeSingle();
    const availability = event ? inscriptionAvailability(event) : { open: false, message: 'Evento no encontrado' };
    if (!availability.open) {
      return res.status(403).json({ message: availability.message });
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

    // Actualizar campos dinámicos: borrar los anteriores y reinsertar.
    // Los campos internos (hotel y primer pago) los gestiona el admin y se conservan.
    if (dynamicFields && typeof dynamicFields === 'object') {
      const keepIds = await protectedFieldIds(eventId);
      let deleteQuery = supabase
        .from('inscription_field_values')
        .delete()
        .eq('inscription_id', inscription.id);
      if (keepIds.length > 0) {
        deleteQuery = deleteQuery.not('field_id', 'in', `(${keepIds.join(',')})`);
      }
      const { error: deleteError } = await deleteQuery;

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
      .select('id, event_id, events ( hotel_food_enabled )')
      .eq('id', id)
      .maybeSingle();

    if (findError) throw findError;
    if (!inscription) {
      return res.status(404).json({ message: 'Inscripción no encontrada' });
    }
    if (!inscription.events?.hotel_food_enabled) {
      return res.status(400).json({ message: 'Este evento no usa confirmación de hotel' });
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

exports.updateFirstPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const { primerPago } = req.body;

    if (typeof primerPago !== 'boolean') {
      return res.status(400).json({ message: 'Indica si el primer pago está realizado' });
    }

    const { data: inscription, error: findError } = await supabase
      .from('inscriptions')
      .select('id, event_id, event_tariffs ( nombre )')
      .eq('id', id)
      .maybeSingle();

    if (findError) throw findError;
    if (!inscription) {
      return res.status(404).json({ message: 'Inscripción no encontrada' });
    }

    if (!isPagoAplazadoName(inscription.event_tariffs?.nombre)) {
      return res.status(400).json({ message: 'El primer pago solo se marca en tarifas de pago aplazado' });
    }

    await setFirstPayment(inscription.id, inscription.event_id, primerPago);

    res.json({
      message: 'Primer pago actualizado',
      primer_pago: primerPago,
    });
  } catch (error) {
    console.error('Error al actualizar el primer pago:', error);
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
      primer_pago: primerPagoFromValues(fieldValuesMap[row.id] || []),
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
