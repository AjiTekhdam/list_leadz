// pages/api/realie-proxy.js
export default async function handler(req, res) {
  // CORS for your Framer site (browser only)
  const allowed = ['https://numerical-people-374905.framer.app', 'http://localhost:3000'];
  const origin = req.headers.origin || '';
  if (allowed.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();

  // Pull address from POST body or GET query
  let address1, address2;
  if (req.method === 'POST') {
    ({ address1, address2 } = req.body || {});
  } else if (req.method === 'GET') {
    address1 = req.query.address1;
    address2 = req.query.address2;
  } else {
    return res.status(405).json({ error: 'Method not allowed', method: req.method });
  }
  if (!address1 || !address2) return res.status(400).json({ error: 'Missing address' });

  const API_KEY = process.env.REALIE_API_KEY;
  if (!API_KEY) return res.status(500).json({ error: 'Missing REALIE_API_KEY at runtime' });

  try {
    // Parse state (e.g., "City, WA 98101" -> "WA")
    const stateMatch = address2.match(/,\s*([A-Z]{2})\b/);
    const state = stateMatch ? stateMatch[1] : null;
    if (!state) return res.status(400).json({ error: 'Could not parse state from address2', address2 });

    // Extract unit from address1 (e.g., "#1801")
    let streetOnly = address1;
    let unitNumberStripped = null;
    const unitMatch = address1.match(/#\s*([\w-]+)/);
    if (unitMatch) {
      unitNumberStripped = unitMatch[1].replace(/[^A-Za-z0-9]/g, '');
      streetOnly = address1.replace(/#\s*[\w-]+/, '').trim();
    }

    const url = new URL('https://app.realie.ai/api/public/property/address/');
    url.searchParams.set('state', state);
    url.searchParams.set('address', streetOnly);
    if (unitNumberStripped) url.searchParams.set('unitNumberStripped', unitNumberStripped);

    const r = await fetch(url.toString(), {
      method: 'GET',
      headers: { Authorization: API_KEY, accept: 'application/json' }
    });

    const text = await r.text();
    if (!r.ok) {
      let realieStatus = null;
      try { realieStatus = JSON.parse(text); } catch {}
      return res.status(r.status).json({ error: 'REALIE error', realieStatus, details: text });
    }

    const data = JSON.parse(text);
    const p = data?.property || {};

    const out = {
      address: p.addressFull ?? null,
      yearBuilt: p.yearBuilt ?? null,
      beds: p.totalBedrooms ?? null,
      baths: p.totalBathrooms ?? null,
      sqft: p.buildingArea ?? null,
      lotSqft: p.landArea ?? (p.acres ? Math.round(p.acres * 43560) : null),
      hoa: null,
      lastSaleDate: p.transferDateObject ?? p.transferDate ?? null,
      lastSalePrice: p.transferPrice ?? null,
      propertyType: p.useCode ?? null,
      unitNumber: p.unitNumber ?? p.unitNumberStripped ?? null
    };

    return res.status(200).json(out);
  } catch (e) {
    return res.status(500).json({ error: 'Proxy crashed', details: String(e) });
  }
}
