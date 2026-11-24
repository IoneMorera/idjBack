const supabase = require('../database');
const { getEventById, getUserInscription, isInscrito } = require('../utils/foodAccess');
const { isStaff, developerPreview } = require('../utils/access');
const { fetchCollection, searchGames } = require('../services/bgg');
const { schemaErrorMessage } = require('../utils/schema');

function normalizeName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function presentUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    nombre: user.nombre,
    apellidos: user.apellidos,
  };
}

function httpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function assertGamesAccess(user, eventId, { write = false } = {}) {
  const event = await getEventById(eventId);
  if (!event) throw httpError('Evento no encontrado', 404);
  const staff = isStaff(user);
  const preview = developerPreview(user, event.games_en_pruebas);
  if (!event.games_enabled && !staff && !preview) {
    throw httpError('El listado de juegos no está habilitado para este evento', 403);
  }
  if (event.games_en_pruebas && !staff) {
    throw httpError('Los juegos están en pruebas', 403);
  }
  if ((event.hidden || event.en_pruebas) && !staff) {
    throw httpError('Evento no encontrado', 404);
  }
  const inscription = await getUserInscription(user.id, eventId);
  if (write && !preview && !isInscrito(inscription)) {
    throw httpError('Debes estar inscrito con estado Inscrito para gestionar juegos', 403);
  }
  if (!write && !staff && !preview && !isInscrito(inscription)) {
    throw httpError('Debes estar inscrito con estado Inscrito para ver los juegos', 403);
  }
  return event;
}

async function loadBoard(eventId, userId) {
  const [gamesResult, requestsResult, collectionResult, profileResult] = await Promise.all([
    supabase
      .from('event_games')
      .select('id, bgg_id, nombre, anio, image_url, manual, created_at, users ( id, username, nombre, apellidos )')
      .eq('event_id', eventId)
      .order('nombre', { ascending: true }),
    supabase
      .from('event_game_requests')
      .select('id, bgg_id, nombre, anio, image_url, created_at, users ( id, username, nombre, apellidos )')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false }),
    supabase
      .from('user_bgg_games')
      .select('bgg_id, nombre, anio, image_url')
      .eq('user_id', userId)
      .order('nombre', { ascending: true }),
    supabase.from('users').select('bgg_username').eq('id', userId).maybeSingle(),
  ]);

  if (gamesResult.error) throw gamesResult.error;
  if (requestsResult.error) throw requestsResult.error;
  if (collectionResult.error) throw collectionResult.error;
  if (profileResult.error) throw profileResult.error;

  const games = (gamesResult.data || []).map((row) => ({
    id: row.id,
    bgg_id: row.bgg_id,
    nombre: row.nombre,
    anio: row.anio,
    image_url: row.image_url,
    manual: row.manual,
    user: presentUser(row.users),
  }));

  const collectionIds = new Set((collectionResult.data || []).map((row) => String(row.bgg_id)));
  const collectionNames = new Set((collectionResult.data || []).map((row) => normalizeName(row.nombre)));
  const myGameKeys = new Set(
    games
      .filter((game) => game.user?.id === userId)
      .flatMap((game) => [game.bgg_id ? `id:${game.bgg_id}` : '', `name:${normalizeName(game.nombre)}`])
      .filter(Boolean),
  );

  function bringersFor(item) {
    return games.filter((game) => {
      if (item.bgg_id && game.bgg_id && String(game.bgg_id) === String(item.bgg_id)) return true;
      return normalizeName(game.nombre) === normalizeName(item.nombre);
    }).map((game) => ({ game_id: game.id, user: game.user }));
  }

  const requests = (requestsResult.data || []).map((row) => {
    const bringers = bringersFor(row);
    const inCollection = (row.bgg_id && collectionIds.has(String(row.bgg_id)))
      || collectionNames.has(normalizeName(row.nombre));
    const broughtByMe = (row.bgg_id && myGameKeys.has(`id:${row.bgg_id}`))
      || myGameKeys.has(`name:${normalizeName(row.nombre)}`);
    return {
      id: row.id,
      bgg_id: row.bgg_id,
      nombre: row.nombre,
      anio: row.anio,
      image_url: row.image_url,
      created_at: row.created_at,
      user: presentUser(row.users),
      in_my_collection: inCollection,
      brought_by_me: broughtByMe,
      bringers,
    };
  });

  const broughtIds = new Set(games.filter((game) => game.user?.id === userId && game.bgg_id).map((game) => String(game.bgg_id)));
  const collection = (collectionResult.data || []).map((row) => ({
    ...row,
    in_event: broughtIds.has(String(row.bgg_id)),
  }));

  return {
    bgg_username: profileResult.data?.bgg_username || null,
    collection,
    games,
    requests,
  };
}

function gamePayload(body) {
  const nombre = String(body.nombre || '').trim();
  const bggId = body.bgg_id == null || body.bgg_id === '' ? null : String(body.bgg_id).trim();
  const anio = body.anio == null || body.anio === '' ? null : Number(body.anio);
  const imageUrl = body.image_url ? String(body.image_url) : null;
  if (!nombre) throw httpError('Indica el nombre del juego', 400);
  if (anio != null && !Number.isInteger(anio)) throw httpError('El año no es válido', 400);
  return { nombre, bgg_id: bggId, anio, image_url: imageUrl };
}

exports.setEnabled = async (req, res) => {
  try {
    const { enabled } = req.body;
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ message: 'El campo enabled debe ser true o false' });
    }
    const { data: event, error } = await supabase
      .from('events')
      .update({ games_enabled: enabled })
      .eq('id', req.params.eventId)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!event) return res.status(404).json({ message: 'Evento no encontrado' });
    res.json({
      message: enabled ? 'Listado de juegos activado' : 'Listado de juegos desactivado',
      event,
    });
  } catch (error) {
    console.error('Error al actualizar juegos:', error);
    res.status(500).json({ message: schemaErrorMessage(error, 'Error interno del servidor') });
  }
};

exports.getBoard = async (req, res) => {
  try {
    const event = await assertGamesAccess(req.user, req.params.eventId);
    const board = await loadBoard(event.id, req.user.id);
    res.json({ games_enabled: event.games_enabled === true, ...board });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error('Error al cargar juegos:', error);
    res.status(status).json({ message: schemaErrorMessage(error, 'Error interno del servidor') });
  }
};

exports.syncCollection = async (req, res) => {
  try {
    const event = await assertGamesAccess(req.user, req.params.eventId, { write: true });
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('bgg_username')
      .eq('id', req.user.id)
      .single();
    if (profileError) throw profileError;
    const username = String(profile?.bgg_username || '').trim();
    if (!username) {
      return res.status(400).json({ message: 'Añade tu usuario de BoardGameGeek en el perfil' });
    }

    const games = await fetchCollection(username);
    const { error: deleteError } = await supabase.from('user_bgg_games').delete().eq('user_id', req.user.id);
    if (deleteError) throw deleteError;

    for (let index = 0; index < games.length; index += 400) {
      const chunk = games.slice(index, index + 400).map((game) => ({
        user_id: req.user.id,
        bgg_id: game.bgg_id,
        nombre: game.nombre,
        anio: game.anio,
        image_url: game.image_url,
        synced_at: new Date().toISOString(),
      }));
      if (!chunk.length) continue;
      const { error } = await supabase.from('user_bgg_games').insert(chunk);
      if (error) throw error;
    }

    const board = await loadBoard(event.id, req.user.id);
    res.json({
      message: games.length
        ? `Colección cargada: ${games.length} juegos`
        : 'La colección está vacía o el usuario no tiene juegos marcados como propios',
      games_enabled: true,
      ...board,
    });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error('Error al sincronizar BGG:', error);
    res.status(status).json({ message: schemaErrorMessage(error, 'Error interno del servidor') });
  }
};

exports.search = async (req, res) => {
  try {
    await assertGamesAccess(req.user, req.params.eventId, { write: true });
    const query = String(req.query.q || '').trim();
    if (query.length < 2) return res.status(400).json({ message: 'Escribe al menos 2 caracteres' });
    const results = await searchGames(query);
    res.json({ results });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error('Error al buscar en BGG:', error);
    res.status(status).json({ message: schemaErrorMessage(error, 'Error interno del servidor') });
  }
};

exports.addGame = async (req, res) => {
  try {
    const event = await assertGamesAccess(req.user, req.params.eventId, { write: true });
    const payload = gamePayload(req.body);
    if (payload.bgg_id) {
      const { data: existing } = await supabase
        .from('event_games')
        .select('id')
        .eq('event_id', event.id)
        .eq('user_id', req.user.id)
        .eq('bgg_id', payload.bgg_id)
        .maybeSingle();
      if (existing) return res.status(409).json({ message: 'Ese juego ya está en tu lista del evento' });
    }

    const { error } = await supabase.from('event_games').insert({
      event_id: event.id,
      user_id: req.user.id,
      ...payload,
      manual: req.body.manual === true || !payload.bgg_id,
    });
    if (error) throw error;

    const board = await loadBoard(event.id, req.user.id);
    res.status(201).json({ message: 'Juego añadido al evento', games_enabled: true, ...board });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error('Error al añadir juego:', error);
    res.status(status).json({ message: schemaErrorMessage(error, 'Error interno del servidor') });
  }
};

exports.removeGame = async (req, res) => {
  try {
    const event = await assertGamesAccess(req.user, req.params.eventId);
    const { data: game, error } = await supabase
      .from('event_games')
      .select('id, user_id')
      .eq('id', req.params.gameId)
      .eq('event_id', event.id)
      .maybeSingle();
    if (error) throw error;
    if (!game) return res.status(404).json({ message: 'Juego no encontrado' });
    if (game.user_id !== req.user.id && !isStaff(req.user)) {
      return res.status(403).json({ message: 'Solo puedes quitar los juegos que tú llevas' });
    }
    const { error: deleteError } = await supabase.from('event_games').delete().eq('id', game.id);
    if (deleteError) throw deleteError;
    const board = await loadBoard(event.id, req.user.id);
    res.json({ message: 'Juego quitado del evento', games_enabled: true, ...board });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error('Error al quitar juego:', error);
    res.status(status).json({ message: schemaErrorMessage(error, 'Error interno del servidor') });
  }
};

exports.addRequest = async (req, res) => {
  try {
    const event = await assertGamesAccess(req.user, req.params.eventId, { write: true });
    const payload = gamePayload(req.body);
    if (payload.bgg_id) {
      const { data: existing } = await supabase
        .from('event_game_requests')
        .select('id')
        .eq('event_id', event.id)
        .eq('user_id', req.user.id)
        .eq('bgg_id', payload.bgg_id)
        .maybeSingle();
      if (existing) return res.status(409).json({ message: 'Ya has pedido ese juego' });
    }
    const { error } = await supabase.from('event_game_requests').insert({
      event_id: event.id,
      user_id: req.user.id,
      ...payload,
    });
    if (error) throw error;
    const board = await loadBoard(event.id, req.user.id);
    res.status(201).json({ message: 'Petición publicada', games_enabled: true, ...board });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error('Error al crear petición:', error);
    res.status(status).json({ message: schemaErrorMessage(error, 'Error interno del servidor') });
  }
};

exports.removeRequest = async (req, res) => {
  try {
    const event = await assertGamesAccess(req.user, req.params.eventId, { write: true });
    const { data: requestRow, error } = await supabase
      .from('event_game_requests')
      .select('id, user_id')
      .eq('id', req.params.requestId)
      .eq('event_id', event.id)
      .maybeSingle();
    if (error) throw error;
    if (!requestRow) return res.status(404).json({ message: 'Petición no encontrada' });
    if (requestRow.user_id !== req.user.id && !isStaff(req.user)) {
      return res.status(403).json({ message: 'Solo puedes borrar tus peticiones' });
    }
    const { error: deleteError } = await supabase.from('event_game_requests').delete().eq('id', requestRow.id);
    if (deleteError) throw deleteError;
    const board = await loadBoard(event.id, req.user.id);
    res.json({ message: 'Petición eliminada', games_enabled: true, ...board });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error('Error al borrar petición:', error);
    res.status(status).json({ message: schemaErrorMessage(error, 'Error interno del servidor') });
  }
};
