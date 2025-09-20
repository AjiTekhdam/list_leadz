// pages/api/attom-proxy.js
export default async function handler(req, res) {
  // CORS — add your real Framer/custom domains here
  const allowed = [
    'https://YOUR-FRAMER-SITE.framer.website',
    'https://YOURCUSTOMDOMAIN.com',
    'http://localhost:3000'
  ];
  const origin = req.headers.origin || '';
  if (allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const API_KEY = process.env.ATTOM_API_KEY;
  if (!API_KEY) return res.status(500).json({ error: 'Missing ATTOM_API_KEY at runtime' });

  try {
    const { address1, address2 } = req.body || {};
    if (!address1 || !address2) return res.status(400).json({ error: 'Missing address' });

    // ATTOM uses the gateway host
    const url = new URL('https://api.gateway.attomdata.com/propertyapi/v1.0.0/property/detail');
    url.searchParams.set('address1', address1);
    url.searchParams.set('address2', address2);

    // 🔑 Call ATTOM with GET (required), passing the API key header
    const r = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        apikey: API_KEY,
        accept: 'application/json'
      }
    });

    const text = await r.text();
    if (!r.ok) {
      // Bubble up ATTOM’s error payload to help debugging
      return res.status(r.status).json({ error: 'ATTOM error', details: text });
    }

    const data = JSON.parse(text);
    const p = (data.property && data.property[0]) || {};

    // Normalize fields
    const bathsFull = Number(p?.building?.rooms?.bathsFull ?? 0);
    const bathsHalf = Number(p?.building?.rooms?.bathsHalf ?? 0);
    const lotAcres = p?.lot?.lotSizeAcres;
    const lotSqft = p?.lot?.lotsize1 ?? (lotAcres ? Math.round(lotAcres * 43560) : null);

    return res.status(200).json({
      address: p?.address?.oneLine ?? null,
      yearBuilt: p?.summary?.yearBuilt ?? null,
      beds: p?.building?.rooms?.beds ?? null,
      baths: (bathsFull || bathsHalf) ? bathsFull + 0.5 * bathsHalf : (p?.building?.rooms?.baths ?? null),
      sqft: p?.building?.size?.livingsize ?? p?.building?.size?.grosssize ?? null,
      lotSqft,
      hoa: p?.assessment?.hoa?.amount ?? p?.association?.hoaAmt ?? null,
      lastSaleDate: p?.salehistory?.[0]?.saleTransDate ?? p?.sale?.saleTransDate ?? null,
      lastSalePrice: p?.salehistory?.[0]?.amount?.saleAmt ?? p?.sale?.amount?.saleAmt ?? null,
      propertyType: p?.summary?.propclass ?? p?.building?.summary?.propType ?? null,
      unitNumber: p?.address?.unit ?? null
    });
  } catch (e) {
    return res.status(500).json({ error: 'Proxy crashed', details: String(e) });
  }
}
