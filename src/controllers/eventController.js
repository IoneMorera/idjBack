const supabase = require('../database');

exports.getAllEvents = async (req, res) => {
  try {
    const { data: events, error } = await supabase
      .from('events')
      .select('*')
      .order('anio', { ascending: false })
      .order('mes', { ascending: true });

    if (error) throw error;

    let stateByEvent = {};
    if (req.user?.id) {
      const { data: inscriptions } = await supabase
        .from('inscriptions')
        .select('event_id, inscription_states ( nombre )')
        .eq('user_id', req.user.id);

      stateByEvent = Object.fromEntries(
        (inscriptions || []).map((row) => [row.event_id, row.inscription_states?.nombre || null]),
      );
    }

    const withState = (events || []).map((event) => ({
      ...event,
      mi_estado: stateByEvent[event.id] || 'Sin inscribir',
    }));

    res.json({ events: withState });
  } catch (error) {
    console.error('Error al obtener eventos:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

exports.getEventById = async (req, res) => {
  try {
    const { data: event, error } = await supabase
      .from('events')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();

    if (error) throw error;
    if (!event) return res.status(404).json({ message: 'Evento no encontrado' });

    res.json({ event });
  } catch (error) {
    console.error('Error al obtener evento:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

exports.createEvent = async (req, res) => {
  try {
    const { nombre, mes, anio } = req.body;

    if (!nombre || !mes || !anio) {
      return res.status(400).json({ message: 'Nombre, mes y año son obligatorios' });
    }

    const { data: event, error } = await supabase
      .from('events')
      .insert({ nombre, mes, anio })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({ message: 'Evento creado correctamente', event });
  } catch (error) {
    console.error('Error al crear evento:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

exports.deleteEvent = async (req, res) => {
  try {
    const { error } = await supabase.from('events').delete().eq('id', req.params.id);
    if (error) throw error;

    res.json({ message: 'Evento eliminado correctamente' });
  } catch (error) {
    console.error('Error al eliminar evento:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};
