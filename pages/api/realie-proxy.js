// pages/api/realie-proxy.js

// Realie endpoints
const ADDRESS_BASE = "https://app.realie.ai/api/public/property/address"; // exact address match
const LOOKUP_BASE  = "https://app.realie.ai/lookup";                      // path-style + lat/lng
const SEARCH_BASE  = "https://app.realie.ai/api/public/property/search";  // general search

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization,x-api-key,X-API-Key");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method Not Allowed" });

  // Debug echo
  if (req.query.__echo === "1") {
    const raw = process.env.REALIE_API_KEY || "";
    return res.status(200).json({
      hasKey: !!raw,
      keyLength: raw.length,
      order: ["address", "lookup", "search"],
      bases: { ADDRESS_BASE, LOOKUP_BASE, SEARCH_BASE },
      triedStyles: [
        "Authorization: Bearer <key>",
        "Authorization: <key>",
        "x-api-key",
        "X-API-Key",
      ],
    });
  }

  const {
    state, city, county, zipCode, address, unitNumberStripped,
    latitude, longitude,
    limit = "1", offset = "0", residential = "true",
  } = req.query || {};

  if (!state) return res.status(400).json({ error: "`state` is required" });

  // auth styles — Realie sometimes accepts raw key or x-api-key
  const rawKey = process.env.REALIE_API_KEY || "";
  if (!rawKey) return res.status(500).json({ error: "REALIE_API_KEY not set" });

  const headerVariants = [
    { style: "auth-bearer", headers: { Accept: "application/json", Authorization: rawKey.startsWith("Bearer ") ? rawKey : `Bearer ${rawKey}` } },
    { style: "auth-raw",    headers: { Accept: "application/json", Authorization: rawKey } },
    { style: "x-api-key",   headers: { Accept: "application/json", "x-api-key": rawKey } },
    { style: "X-API-Key",   headers: { Accept: "application/json", "X-API-Key": rawKey } },
  ];

  const tryUpstream = async (url) => {
    let resp, body, used = "none";
    for (const v of headerVariants) {
      resp = await fetch(url, { headers: v.headers, cache: "no-store" });
      body = await resp.text();
      used = v.style;
      if (resp.ok || (resp.status !== 401 && resp.status !== 403)) break;
    }
    return { resp, body, used };
  };

  // Normalize to the pass-through shape your client expects
  const wrapOne = (obj) => JSON.stringify({
    properties: obj ? [obj] : [],
    metadata: { limit: 1, offset: 0, count: obj ? 1 : 0 },
  });

  try {
    // -----------------------------
    // 1) ADDRESS endpoint (best for exact street matches)
    // -----------------------------
    if (address) {
      const qsA = new URLSearchParams();
      qsA.set("state", String(state).toUpperCase());
      // Realie /address works fine with just state + address; we’ll pass optional extras too
      qsA.set("address", address);
      if (city)   qsA.set("city", String(city).toUpperCase());
      if (zipCode) qsA.set("zipCode", zipCode);
      if (unitNumberStripped) qsA.set("unitNumberStripped", unitNumberStripped);
      qsA.set("limit", String(limit));
      qsA.set("offset", String(offset));
      qsA.set("residential", String(residential));

      const urlA = `${ADDRESS_BASE}/?${qsA.toString()}`;
      const { resp, body, used } = await tryUpstream(urlA);

      if (resp.ok) {
        // /address returns a single property object
        let obj = null;
        try { obj = JSON.parse(body); } catch {}
        res.setHeader("x-auth-style", used);
        return res
          .status(200)
          .setHeader("Content-Type", "application/json")
          .send(wrapOne(obj));
      }
      if (resp.status !== 404) {
        // error other than "not found" — bubble it
        res.setHeader("x-auth-style", used);
        return res
          .status(resp.status)
          .setHeader("Content-Type", resp.headers.get("content-type") || "application/json")
          .send(body);
      }
      // 404 → fall through
    }

    // -----------------------------
    // 2) LOOKUP endpoint (needs state/city/address + lat/lng)
    // -----------------------------
    if (latitude && longitude && city && address) {
      const urlL =
        `${LOOKUP_BASE}/${encodeURIComponent(String(state).toUpperCase())}` +
        `/${encodeURIComponent(String(city).toUpperCase())}` +
        `/${encodeURIComponent(address)}?latitude=${encodeURIComponent(latitude)}&longitude=${encodeURIComponent(longitude)}`;

      const { resp, body, used } = await tryUpstream(urlL);

      if (resp.ok) {
        let obj = null;
        try { obj = JSON.parse(body); } catch {}
        res.setHeader("x-auth-style", used);
        return res
          .status(200)
          .setHeader("Content-Type", "application/json")
          .send(wrapOne(obj));
      }
      if (resp.status !== 404) {
        res.setHeader("x-auth-style", used);
        return res
          .status(resp.status)
          .setHeader("Content-Type", resp.headers.get("content-type") || "application/json")
          .send(body);
      }
      // 404 → fall through
    }

    // -----------------------------
    // 3) SEARCH endpoint (broad fallback)
    // -----------------------------
    const qsS = new URLSearchParams();
    qsS.set("state", String(state).toUpperCase());
    if (city)   qsS.set("city", String(city).toUpperCase());
    if (county) qsS.set("county", county);
    if (zipCode) qsS.set("zipCode", zipCode);
    if (address) qsS.set("address", address);
    if (unitNumberStripped) qsS.set("unitNumberStripped", unitNumberStripped);
    qsS.set("limit", String(limit));
    qsS.set("offset", String(offset));
    qsS.set("residential", String(residential));

    const urlS = `${SEARCH_BASE}?${qsS.toString()}`;
    const { resp, body, used } = await tryUpstream(urlS);

    // Realie sometimes uses 404 to mean "no matches" — normalize to empty list
    if (resp.status === 404) {
      res.setHeader("x-auth-style", used);
      return res
        .status(200)
        .setHeader("Content-Type", "application/json")
        .json({ properties: [], metadata: { limit, offset, count: 0 } });
    }

    res.setHeader("x-auth-style", used);
    return res
      .status(resp.status)
      .setHeader("Content-Type", resp.headers.get("content-type") || "application/json")
      .send(body);

  } catch (e) {
    return res.status(500).json({ error: e?.message || "proxy error" });
  }
}
