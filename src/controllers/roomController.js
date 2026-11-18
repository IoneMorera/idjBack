const supabase = require('../database');
const { getEventById } = require('../utils/foodAccess');
const { schemaErrorMessage } = require('../utils/schema');

function presentUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    nombre: row.nombre,
    apellidos: row.apellidos,
    email: row.email,
  };
}

function normalizeName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function isRoomOrganizer(user) {
  const names = [user?.username, user?.nombre].map(normalizeName);
  return names.some((name) => name === 'pi' || name === 'pilar' || name === 'vic' || name === 'victor');
}

async function loadContext(eventId) {
  const { data: rooms, error } = await supabase
    .from('event_rooms')
    .select('id, event_id, nombre, plazas, created_at')
    .eq('event_id', eventId)
    .order('nombre', { ascending: true })
    .order('id', { ascending: true });
  if (error) throw error;

  const roomIds = (rooms || []).map((room) => room.id);
  let assignments = [];
  if (roomIds.length) {
    const { data, error: assignmentError } = await supabase
      .from('event_room_assignments')
      .select('id, room_id, slot, user_id')
      .in('room_id', roomIds);
    if (assignmentError) throw assignmentError;
    assignments = data || [];
  }

  const { data: inscriptions, error: inscriptionError } = await supabase
    .from('inscriptions')
    .select('user_id, nombre, apellidos, email, users ( id, username ), inscription_states ( nombre )')
    .eq('event_id', eventId);
  if (inscriptionError) throw inscriptionError;

  const inscribed = (inscriptions || [])
    .filter((row) => row.inscription_states?.nombre === 'Inscrito')
    .map((row) => ({
      id: row.user_id,
      username: row.users?.username || '',
      nombre: row.nombre,
      apellidos: row.apellidos,
      email: row.email,
    }));

  const { data: accounts, error: accountsError } = await supabase
    .from('users')
    .select('id, username, nombre, apellidos, email');
  if (accountsError) throw accountsError;

  const organizers = (accounts || [])
    .filter(isRoomOrganizer)
    .map((user) => ({
      id: user.id,
      username: user.username,
      nombre: user.nombre,
      apellidos: user.apellidos,
      email: user.email,
    }));

  const assignable = [...inscribed];
  for (const organizer of organizers) {
    if (!assignable.some((user) => user.id === organizer.id)) assignable.push(organizer);
  }

  const usersById = Object.fromEntries(assignable.map((user) => [user.id, user]));
  const assignedIds = new Set(assignments.map((row) => row.user_id).filter(Boolean));

  const presentedRooms = (rooms || []).map((room) => ({
    id: room.id,
    nombre: room.nombre,
    plazas: room.plazas,
    slots: Array.from({ length: room.plazas }, (_, index) => {
      const slot = index + 1;
      const assignment = assignments.find((row) => row.room_id === room.id && row.slot === slot && row.user_id);
      return {
        slot,
        user: assignment ? usersById[assignment.user_id] || presentUser({ id: assignment.user_id }) : null,
      };
    }),
  }));

  return {
    rooms: presentedRooms,
    unassigned: assignable.filter((user) => !assignedIds.has(user.id)),
    inscribed: assignable,
  };
}

async function getOwnedRoom(eventId, roomId) {
  const { data: room, error } = await supabase
    .from('event_rooms')
    .select('id, event_id, nombre, plazas')
    .eq('id', roomId)
    .eq('event_id', eventId)
    .maybeSingle();
  if (error) throw error;
  return room;
}

exports.getRooms = async (req, res) => {
  try {
    const event = await getEventById(req.params.eventId);
    if (!event) return res.status(404).json({ message: 'Evento no encontrado' });
    const context = await loadContext(event.id);
    res.json(context);
  } catch (error) {
    console.error('Error al listar habitaciones:', error);
    res.status(500).json({ message: schemaErrorMessage(error, 'Error interno del servidor') });
  }
};

exports.createRoom = async (req, res) => {
  try {
    const event = await getEventById(req.params.eventId);
    if (!event) return res.status(404).json({ message: 'Evento no encontrado' });

    const nombre = String(req.body.nombre || '').trim();
    const plazas = Number(req.body.plazas);
    if (!nombre) return res.status(400).json({ message: 'Indica un nombre para la habitación' });
    if (!Number.isInteger(plazas) || plazas < 1 || plazas > 30) {
      return res.status(400).json({ message: 'El número de plazas tiene que estar entre 1 y 30' });
    }

    const { error } = await supabase.from('event_rooms').insert({
      event_id: event.id,
      nombre,
      plazas,
    });
    if (error) throw error;

    res.status(201).json({ message: 'Habitación creada', ...(await loadContext(event.id)) });
  } catch (error) {
    console.error('Error al crear habitación:', error);
    res.status(500).json({ message: schemaErrorMessage(error, 'Error interno del servidor') });
  }
};

exports.updateRoom = async (req, res) => {
  try {
    const room = await getOwnedRoom(req.params.eventId, req.params.roomId);
    if (!room) return res.status(404).json({ message: 'Habitación no encontrada' });

    const patch = {};
    if ('nombre' in req.body) {
      const nombre = String(req.body.nombre || '').trim();
      if (!nombre) return res.status(400).json({ message: 'Indica un nombre para la habitación' });
      patch.nombre = nombre;
    }
    if ('plazas' in req.body) {
      const plazas = Number(req.body.plazas);
      if (!Number.isInteger(plazas) || plazas < 1 || plazas > 30) {
        return res.status(400).json({ message: 'El número de plazas tiene que estar entre 1 y 30' });
      }
      patch.plazas = plazas;
    }
    if (!Object.keys(patch).length) {
      return res.status(400).json({ message: 'No hay cambios que guardar' });
    }

    const { error } = await supabase.from('event_rooms').update(patch).eq('id', room.id);
    if (error) throw error;

    if (patch.plazas && patch.plazas < room.plazas) {
      await supabase.from('event_room_assignments').delete().eq('room_id', room.id).gt('slot', patch.plazas);
    }

    res.json({ message: 'Habitación actualizada', ...(await loadContext(room.event_id)) });
  } catch (error) {
    console.error('Error al actualizar habitación:', error);
    res.status(500).json({ message: schemaErrorMessage(error, 'Error interno del servidor') });
  }
};

exports.deleteRoom = async (req, res) => {
  try {
    const room = await getOwnedRoom(req.params.eventId, req.params.roomId);
    if (!room) return res.status(404).json({ message: 'Habitación no encontrada' });
    const { error } = await supabase.from('event_rooms').delete().eq('id', room.id);
    if (error) throw error;
    res.json({ message: 'Habitación eliminada', ...(await loadContext(room.event_id)) });
  } catch (error) {
    console.error('Error al eliminar habitación:', error);
    res.status(500).json({ message: schemaErrorMessage(error, 'Error interno del servidor') });
  }
};

exports.assignSlot = async (req, res) => {
  try {
    const room = await getOwnedRoom(req.params.eventId, req.params.roomId);
    if (!room) return res.status(404).json({ message: 'Habitación no encontrada' });

    const slot = Number(req.body.slot);
    const userId = req.body.userId == null || req.body.userId === '' ? null : Number(req.body.userId);
    if (!Number.isInteger(slot) || slot < 1 || slot > room.plazas) {
      return res.status(400).json({ message: 'Plaza no válida' });
    }

    if (userId != null) {
      if (!Number.isInteger(userId)) return res.status(400).json({ message: 'Usuario no válido' });
      const [{ data: inscription, error }, { data: account, error: accountError }] = await Promise.all([
        supabase
          .from('inscriptions')
          .select('user_id, inscription_states ( nombre )')
          .eq('event_id', room.event_id)
          .eq('user_id', userId)
          .maybeSingle(),
        supabase
          .from('users')
          .select('id, username, nombre')
          .eq('id', userId)
          .maybeSingle(),
      ]);
      if (error) throw error;
      if (accountError) throw accountError;
      const inscribed = inscription?.inscription_states?.nombre === 'Inscrito';
      if (!inscribed && !isRoomOrganizer(account)) {
        return res.status(400).json({ message: 'Solo se pueden asignar usuarios inscritos o los organizadores Pi y Vic' });
      }

      const { data: eventRooms, error: roomsError } = await supabase
        .from('event_rooms')
        .select('id')
        .eq('event_id', room.event_id);
      if (roomsError) throw roomsError;
      const roomIds = (eventRooms || []).map((row) => row.id);
      if (roomIds.length) {
        const { error: clearError } = await supabase
          .from('event_room_assignments')
          .delete()
          .in('room_id', roomIds)
          .eq('user_id', userId);
        if (clearError) throw clearError;
      }
    }

    const { error: clearSlotError } = await supabase
      .from('event_room_assignments')
      .delete()
      .eq('room_id', room.id)
      .eq('slot', slot);
    if (clearSlotError) throw clearSlotError;

    if (userId != null) {
      const { error: insertError } = await supabase.from('event_room_assignments').insert({
        room_id: room.id,
        slot,
        user_id: userId,
      });
      if (insertError) throw insertError;
    }

    res.json({ message: 'Plaza actualizada', ...(await loadContext(room.event_id)) });
  } catch (error) {
    console.error('Error al asignar plaza:', error);
    res.status(500).json({ message: schemaErrorMessage(error, 'Error interno del servidor') });
  }
};
