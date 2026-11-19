const BGG_API = 'https://boardgamegeek.com/xmlapi2';

function decodeXml(value) {
  return String(value || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .trim();
}

function attr(source, name) {
  const match = new RegExp(`\\b${name}="([^"]*)"`).exec(source || '');
  return match ? decodeXml(match[1]) : '';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function bggHeaders() {
  const token = String(process.env.BGG_API_TOKEN || '').trim();
  const headers = {
    'User-Agent': 'IDJ-LudoVyP/1.0 (gestion de eventos)',
    Accept: 'application/xml,text/xml,*/*',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function fetchBgg(url, attempts = 8) {
  if (!String(process.env.BGG_API_TOKEN || '').trim()) {
    const error = new Error('BoardGameGeek exige un token de aplicación. Añádelo en el servidor como BGG_API_TOKEN.');
    error.status = 503;
    throw error;
  }

  let lastText = '';
  let lastStatus = 0;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    let response;
    try {
      response = await fetch(url, { headers: bggHeaders() });
    } catch {
      await sleep(1500 + attempt * 1000);
      continue;
    }
    lastStatus = response.status;
    lastText = await response.text();
    const queued = response.status === 202
      || /request for this collection has been accepted/i.test(lastText)
      || /Please try again/i.test(lastText);
    const busy = response.status === 429 || response.status === 500 || response.status === 503;
    if (queued || busy) {
      await sleep(1500 + attempt * 1000);
      continue;
    }
    if (response.status === 401 || response.status === 403) {
      const error = new Error('BoardGameGeek ha rechazado el acceso. Revisa el token BGG_API_TOKEN.');
      error.status = 502;
      throw error;
    }
    if (!response.ok) {
      const error = new Error('BoardGameGeek no ha respondido');
      error.status = 502;
      error.bggStatus = response.status;
      throw error;
    }
    return lastText;
  }
  const preparing = lastStatus === 202 || /Please try again/i.test(lastText);
  const error = new Error(preparing
    ? 'BoardGameGeek está preparando la colección. Inténtalo de nuevo en unos segundos.'
    : 'BoardGameGeek no ha respondido');
  error.status = preparing ? 503 : 502;
  error.bggStatus = lastStatus;
  error.body = lastText.slice(0, 300);
  throw error;
}

function parseItems(xml) {
  const items = [];
  const pattern = /<item\b([^>]*)>([\s\S]*?)<\/item>/g;
  let match = pattern.exec(xml);
  while (match) {
    items.push({ attrs: match[1], body: match[2] });
    match = pattern.exec(xml);
  }
  return items;
}

function parseCollection(xml) {
  if (/Invalid username/i.test(xml)) {
    const error = new Error('Ese usuario de BoardGameGeek no existe');
    error.status = 404;
    throw error;
  }
  const games = parseItems(xml).map(({ attrs, body }) => {
    const subtype = attr(attrs, 'subtype');
    if (subtype && subtype !== 'boardgame') return null;
    const own = /<status\b[^>]*\bown="1"/.test(body);
    if (/<status\b/.test(body) && !own) return null;
    const name = decodeXml((/<name[^>]*>([^<]*)<\/name>/.exec(body) || [])[1] || '');
    const bggId = attr(attrs, 'objectid');
    if (!bggId || !name) return null;
    const year = Number((/<yearpublished>(\d+)<\/yearpublished>/.exec(body) || [])[1]);
    const image = decodeXml((/<thumbnail>([^<]*)<\/thumbnail>/.exec(body) || /<image>([^<]*)<\/image>/.exec(body) || [])[1] || '');
    return {
      bgg_id: bggId,
      nombre: name,
      anio: Number.isInteger(year) ? year : null,
      image_url: image || null,
    };
  }).filter(Boolean);

  const byId = new Map();
  for (const game of games) {
    const current = byId.get(game.bgg_id);
    if (!current || (game.anio != null && (current.anio == null || game.anio > current.anio))) {
      byId.set(game.bgg_id, game);
    } else if (!current.image_url && game.image_url) {
      current.image_url = game.image_url;
    }
  }
  return [...byId.values()];
}

function parseSearch(xml) {
  return parseItems(xml).map(({ attrs, body }) => {
    const type = attr(attrs, 'type');
    if (type && type !== 'boardgame') return null;
    const names = [...body.matchAll(/<name\b([^>]*)\/?>/g)];
    const primary = names.find((entry) => attr(entry[1], 'type') === 'primary') || names[0];
    const nombre = primary ? attr(primary[1], 'value') : '';
    const bggId = attr(attrs, 'id');
    if (!bggId || !nombre) return null;
    const yearTag = /<yearpublished\b([^>]*)\/?>/.exec(body);
    const year = yearTag ? Number(attr(yearTag[1], 'value')) : null;
    return {
      bgg_id: bggId,
      nombre,
      anio: Number.isInteger(year) ? year : null,
    };
  }).filter(Boolean).slice(0, 20);
}

async function fetchCollection(username) {
  const url = `${BGG_API}/collection?username=${encodeURIComponent(username)}&own=1&subtype=boardgame&excludesubtype=boardgameexpansion&stats=0`;
  const xml = await fetchBgg(url);
  return parseCollection(xml);
}

async function searchGames(query) {
  const url = `${BGG_API}/search?query=${encodeURIComponent(query)}&type=boardgame`;
  const xml = await fetchBgg(url, 2);
  return parseSearch(xml);
}

module.exports = { fetchCollection, searchGames };
