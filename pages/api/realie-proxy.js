// api/realie-proxy.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';

const REALIE_BASE = 'https://app.realie.ai/api/public/property/search/';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS (tighten to your domain in production)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const {
    state, county, city, zipCode, address, unitNumberStripped,
    limit = '1', offset = '0', residential = 'true',
  } = req.query as Record<string, string | undefined>;

  if (!state) return res.status(400).json({ error: '`state` is required' });

  const qs = new URLSearchParams();
  qs.set('state', state);
  if (county) qs.set('county', county);
  if (city) qs.set('city', city);
  if (zipCode) qs.set('zipCode', zipCode);
  if (address) qs.set('address', address);              // street only per docs
  if (unitNumberStripped) qs.set('unitNumberStripped', unitNumberStripped);
  qs.set('limit', limit);
  qs.set('offset', offset);
  qs.set('residential', residential);

  const realie = await fetch(`${REALIE_BASE}?${qs.toString()}`, {
    headers: { Authorization: process.env.REALIE_API_KEY! },
  });

  if (!realie.ok) {
    const text = await realie.text();
    return res.status(realie.status).send(text);
  }

  const data = await realie.json();
  const p = data?.properties?.[0];

  // Normalize the fields your form needs
  const normalized = p ? {
    addressFull: p.addressFull ?? null,
    zipCode: p.zipCode ?? null,                   // schema: zipCode
    beds: p.totalBedrooms ?? null,                // schema: totalBedrooms
    baths: p.totalBathrooms ?? null,              // schema: totalBathrooms
    sqft: p.buildingArea ?? null,                 // schema: buildingArea
    useCode: p.useCode ?? null,                   // schema: useCode
    propertyType: mapUseCode(p.useCode),          // via feature key
    hoa: null,                                    // not provided by schema
  } : null;

  return res.status(200).json({ normalized, raw: data });
}

function mapUseCode(code?: string) {
  // Common mappings; fall back to the code if unknown
  const m: Record<string, string> = {
    '1001': 'Single Family Residential',
    '1002': 'Townhouse',
    '1004': 'Condominium Unit',
    '1101': 'Duplex',
    '1102': 'Triplex',
    '1103': 'Quadplex',
    '1110': 'Multi-Family (2+)',
    '1999': 'Single Family (Assumed)',
  };
  return code && m[code] ? m[code] : code || null;
}
