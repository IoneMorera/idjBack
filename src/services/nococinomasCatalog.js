const BASE_URL = 'https://www.nococinomas.es';

const COOKIE_VALUE = encodeURIComponent(JSON.stringify({
  consents: {
    'cookiesplus-finality-1': 'on',
    'cookiesplus-finality-3': 'on',
    'cookiesplus-finality-4': 'on',
  },
  consent_mode: {},
}));

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; LudoVyP/1.0)',
      Cookie: `cookiesplus=${COOKIE_VALUE}`,
    },
  });
  if (!response.ok) {
    throw new Error(`No se pudo acceder a NoCocinoMás (${response.status})`);
  }
  return response.text();
}

function parseProducts(html, category) {
  const chunks = html.split(/data-id-product="/).slice(1);
  const products = [];

  for (const chunk of chunks) {
    const idMatch = chunk.match(/^(\d+)"/);
    if (!idMatch) continue;

    const urlMatch = chunk.match(/href="([^"]+)"/);
    const nameMatch = chunk.match(/alt="([^"]+)"/) || chunk.match(/title="([^"]+)"/);
    const priceMatch = chunk.match(/([\d]+[.,]\d{2})\s*€/);
    const imgMatch = chunk.match(/src="([^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/i);

    if (!urlMatch || !nameMatch) continue;

    let externalUrl = urlMatch[1];
    if (externalUrl.startsWith('/')) {
      externalUrl = `${BASE_URL}${externalUrl}`;
    }

    products.push({
      external_id: idMatch[1],
      external_url: externalUrl.split('?')[0],
      name: nameMatch[1].trim(),
      price: priceMatch ? parseFloat(priceMatch[1].replace(',', '.')) : null,
      image_url: imgMatch
        ? (imgMatch[1].startsWith('http') ? imgMatch[1] : `${BASE_URL}${imgMatch[1]}`)
        : null,
      category,
    });
  }

  return products;
}

function normalizeName(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractIdFromUrl(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url, BASE_URL);
    const fromQuery = parsed.searchParams.get('id_product');
    if (fromQuery) return fromQuery;
  } catch {
    // ignore
  }
  const match = String(url).match(/\/(\d+)-[^/?#]+/);
  return match ? match[1] : null;
}

function extractIdFromHtml(html) {
  const patterns = [
    /name="id_product"\s+value="(\d+)"/i,
    /data-id-product="(\d+)"/i,
    /id_product["']?\s*[:=]\s*["']?(\d+)/i,
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function pickProductByName(products, name) {
  const want = normalizeName(name);
  if (!want || products.length === 0) return null;
  return products.find((p) => normalizeName(p.name) === want)
    || products.find((p) => {
      const got = normalizeName(p.name);
      return got.includes(want) || want.includes(got);
    })
    || (products.length === 1 ? products[0] : null);
}

async function resolveOneProduct({ name, url }) {
  const fromUrl = extractIdFromUrl(url);
  if (fromUrl) {
    return { name, url: url || null, productId: fromUrl };
  }

  if (url) {
    try {
      const html = await fetchHtml(url);
      const id = extractIdFromHtml(html);
      if (id) return { name, url, productId: id };
    } catch {
      // continuar con búsqueda por nombre
    }
  }

  if (!name) return { name, url: url || null, productId: null };

  try {
    const searchUrl = `${BASE_URL}/busqueda?controller=search&s=${encodeURIComponent(name)}`;
    const html = await fetchHtml(searchUrl);
    const products = parseProducts(html, 'search');
    const product = pickProductByName(products, name);
    if (product?.external_id) {
      return { name, url: product.external_url, productId: product.external_id };
    }
    const id = extractIdFromHtml(html);
    if (id) return { name, url: product?.external_url || url || null, productId: id };
  } catch {
    // ignore
  }

  return { name, url: url || null, productId: null };
}

async function resolveProductIds(items) {
  const resolved = [];
  for (const item of items) {
    resolved.push(await resolveOneProduct({
      name: item.name,
      url: item.url,
    }));
  }
  return resolved;
}

async function discoverCategoryUrls() {
  const homeHtml = await fetchHtml(`${BASE_URL}/`);
  const urls = [...new Set(
    [...homeHtml.matchAll(/href="(https:\/\/www\.nococinomas\.es\/\d+-[^"]+)"/g)].map((m) => m[1]),
  )];

  return urls.filter((url) => !url.includes('/content/') && !url.includes('/module/'));
}

/**
 * Obtiene todos los platos únicos publicados en nococinomas.es
 * @param {(progress: object) => void} [onProgress]
 */
async function fetchAllDishes(onProgress) {
  onProgress?.({
    phase: 'discover',
    message: 'Buscando categorías en NoCocinoMás…',
    percent: 2,
  });

  const categoryUrls = await discoverCategoryUrls();
  if (categoryUrls.length === 0) {
    throw new Error('No se encontraron categorías en NoCocinoMás. La web puede haber cambiado.');
  }

  onProgress?.({
    phase: 'categories',
    message: `Se encontraron ${categoryUrls.length} categorías`,
    percent: 5,
    current: 0,
    total: categoryUrls.length,
    dishesSoFar: 0,
  });

  const byUrl = new Map();
  const total = categoryUrls.length;

  for (let i = 0; i < categoryUrls.length; i++) {
    const categoryUrl = categoryUrls[i];
    const slug = categoryUrl.split('/').pop().replace(/^\d+-/, '').replace(/-/g, ' ');
    let html;
    try {
      html = await fetchHtml(categoryUrl);
    } catch {
      onProgress?.({
        phase: 'categories',
        message: `Omitiendo categoría: ${slug}`,
        percent: 5 + Math.round(((i + 1) / total) * 75),
        current: i + 1,
        total,
        category: slug,
        dishesSoFar: byUrl.size,
      });
      continue;
    }

    for (const product of parseProducts(html, slug)) {
      if (!byUrl.has(product.external_url)) {
        byUrl.set(product.external_url, product);
      }
    }

    onProgress?.({
      phase: 'categories',
      message: `Leyendo «${slug}»…`,
      percent: 5 + Math.round(((i + 1) / total) * 75),
      current: i + 1,
      total,
      category: slug,
      dishesSoFar: byUrl.size,
    });
  }

  const dishes = [...byUrl.values()];
  if (dishes.length === 0) {
    throw new Error('No se encontraron platos en NoCocinoMás. Comprueba la estructura de la web.');
  }

  onProgress?.({
    phase: 'scraped',
    message: `Encontrados ${dishes.length} platos únicos`,
    percent: 82,
    dishesSoFar: dishes.length,
  });

  return dishes;
}

module.exports = { fetchAllDishes, resolveProductIds, extractIdFromUrl };
