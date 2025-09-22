// pages/api/realie-proxy.js
export default async function handler(req, res) {
  // CORS — your Framer site
  const allowed = [
    'https://numerical-people-374905.framer.app',
    'http://localhost:3000'
  ];
  const origin = req.headers.origin || '';
  if (allowed.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const API_KEY = process.env.REALIE_API_KEY;
  if (!API_KEY) return res.status(500).json({ error: 'Missing REALIE_API_KEY at runtime' });

  try {
    const { address1, address2 } = req.body || {};
    if (!address1 || !address2) return res.status(400).json({ error: 'Missing address' });

    // Parse address2 like "City, ST ZIP" → we only need state (2 letters)
    const stateMatch = address2.match(/,\s*([A-Z]{2})\b/);
    const state = stateMatch ? stateMatch[1] : null;
    if (!state) return res.status(400).json({ error: 'Could not parse state from address2' });

    // Split unit from address1 like "500 Union St #1801"
    let streetOnly = address1;
    let unitNumberStripped = null;
    const unitMatch = address1.match(/#\s*([\w-]+)/);
    if (unitMatch) {
      unitNumberStripped = unitMatch[1].replace(/[^A-Za-z0-9]/g, '');
      streetOnly = address1.replace(/#\s*[\w-]+/, '').trim();
    }

    // Build Realie request (state + address required; unit optional)
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

    // Map Realie → your schema
    const out = {
      address: p.addressFull ?? null,                                  // addressFull
      yearBuilt: p.yearBuilt ?? null,                                   // yearBuilt
      beds: p.totalBedrooms ?? null,                                    // totalBedrooms
      baths: p.totalBathrooms ?? null,                                  // totalBathrooms (already float-friendly)
      sqft: p.buildingArea ?? null,                                     // buildingArea
      lotSqft: p.landArea ?? (p.acres ? Math.round(p.acres * 43560) : null), // landArea or acres→sqft
      hoa: null,                                                        // HOAs not guaranteed in schema
      lastSaleDate: p.transferDateObject ?? p.transferDate ?? null,     // transferDateObject / transferDate
      lastSalePrice: p.transferPrice ?? null,                           // transferPrice
      propertyType: p.useCode ?? null,                                  // useCode (or add your own mapping)
      unitNumber: p.unitNumber ?? p.unitNumberStripped ?? null          // unit
    };

    return res.status(200).json(out);
  } catch (e) {
    return res.status(500).json({ error: 'Proxy crashed', details: String(e) });
  }
}
