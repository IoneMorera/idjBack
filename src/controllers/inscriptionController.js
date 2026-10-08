const supabase = require('../database');
const { sendInscriptionEmails } = require('../services/emailService');

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
        events ( nombre, mes, anio )
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

    // Obtener valores de campos dinámicos
    const { data: fieldValues } = await supabase
      .from('inscription_field_values')
      .select('field_id, value')
      .eq('inscription_id', inscription.id);

    const flat = {
      ...inscription,
      estado_nombre: inscription.inscription_states?.nombre,
      evento_nombre: inscription.events?.nombre,
      mes: inscription.events?.mes,
      anio: inscription.events?.anio,
      field_values: fieldValues || [],
    };
    delete flat.inscription_states;
    delete flat.events;

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
    const { nombre, apellidos, telefono, email, dni, dynamicFields } = req.body;

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

    const { data: inscription, error } = await supabase
      .from('inscriptions')
      .insert({
        user_id: userId,
        event_id: eventId,
        state_id: pendienteState.id,
        dni, nombre, apellidos,
        telefono: telefono || null,
        email,
      })
      .select(`*, inscription_states ( nombre )`)
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
    };
    delete flat.inscription_states;

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

exports.getAllInscriptions = async (req, res) => {
  try {
    const { eventId } = req.query;

    let query = supabase
      .from('inscriptions')
      .select(`
        *,
        inscription_states ( nombre ),
        events ( nombre, mes, anio ),
        users ( username )
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
      const { data: allFieldValues } = await supabase
        .from('inscription_field_values')
        .select('inscription_id, field_id, value')
        .in('inscription_id', inscriptionIds);

      if (allFieldValues) {
        for (const fv of allFieldValues) {
          if (!fieldValuesMap[fv.inscription_id]) fieldValuesMap[fv.inscription_id] = [];
          fieldValuesMap[fv.inscription_id].push(fv);
        }
      }
    }

    const inscriptions = rows.map(row => ({
      ...row,
      estado_nombre: row.inscription_states?.nombre,
      evento_nombre: row.events?.nombre,
      mes: row.events?.mes,
      anio: row.events?.anio,
      username: row.users?.username,
      field_values: fieldValuesMap[row.id] || [],
      inscription_states: undefined,
      events: undefined,
      users: undefined,
    }));

    res.json({ inscriptions });
  } catch (error) {
    console.error('Error al obtener inscripciones:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};
