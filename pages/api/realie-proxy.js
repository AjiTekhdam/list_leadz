// pages/api/realie-proxy.js

const SEARCH_BASE = "https://app.realie.ai/api/public/property/search"; // JSON
const LOOKUP_BASE = "https://app.realie.ai/lookup";                      // path-style

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
      triedStyles: ["Authorization: Bearer <key>", "Authorization: <key>", "x-api-key", "X-API-Key"],
      baseSearch: SEARCH_BASE,
      baseLookup: LOOKUP_BASE,
    });
  }

  const {
    state, city, county, zipCode, address, unitNumberStripped,
    latitude, longitude,
    limit = "1", offset = "0", residential = "true",
  } = req.query || {};

  if (!state) return res.status(400).json({ error: "`state` is required" });

  const rawKey = process.env.REALIE_API_KEY || "";
  if (!rawKey) return res.status(500).json({ error: "REALIE_API_KEY not set" });

  const headerVariants = [
    { style: "auth-bearer", headers: { Accept: "application/json", Authorization: rawKey.startsWith("Bearer ") ? rawKey : `Bearer ${rawKey}` } },
    { style: "auth-raw",    headers: { Accept: "application/json", Authorization: rawKey } },
    { style: "x-api-key",   headers: { Accept: "application/json", "x-api-key": rawKey } },
    { style: "X-API-Key",   headers: { Accept: "application/json", "X-API-Key": rawKey } },
  ];

  // Helper that tries all header styles in order
  const upstreamFetch = async (url) => {
    let used = "none", resp, body;
    for (const v of headerVariants) {
      resp = await fetch(url, { headers: v.headers, cache: "no-store" });
      body = await resp.text();
      used = v.style;
      if (resp.ok || (resp.status !== 401 && resp.status !== 403)) break;
    }
    return { resp, body, used };
  };

  try {
    // ===== 1) LOOKUP (path-style) if we have lat/lng + city + address =====
    if (latitude && longitude && city && address) {
      const url = `${LOOKUP_BASE}/${encodeURIComponent(String(state).toUpperCase())}` +
                  `/${encodeURIComponent(String(city).toUpperCase())}` +
                  `/${encodeURIComponent(address)}?latitude=${encodeURIComponent(latitude)}&longitude=${encodeURIComponent(longitude)}`;
      const { resp, body, used } = await upstreamFetch(url);

      if (resp.ok) {
        // Realie lookup returns a single property object → wrap to match search shape
        res.setHeader("x-auth-style", used);
        return res
          .status(200)
          .setHeader("Content-Type", "application/json")
          .send(JSON.stringify({ properties: body ? [JSON.parse(body)] : [], metadata: { limit: 1, offset: 0, count: body ? 1 : 0 } }));
      }

      if (resp.status !== 404) {
        res.setHeader("x-auth-style", used);
        return res
          .status(resp.status)
          .setHeader("Content-Type", resp.headers.get("content-type") || "application/json")
          .send(body);
      }
      // if 404 → fall through to search
    }

    // ===== 2) SEARCH (query-style) =====
    const qs = new URLSearchParams();
    qs.set("state", String(state).toUpperCase());
    if (city)   qs.set("city",   String(city).toUpperCase());
    if (county) qs.set("county", county);
    if (zipCode) qs.set("zipCode", zipCode);
    if (address) qs.set("address", address);
    if (unitNumberStripped) qs.set("unitNumberStripped", unitNumberStripped);
    qs.set("limit", String(limit));
    qs.set("offset", String(offset));
    qs.set("residential", String(residential));

    const searchUrl = `${SEARCH_BASE}?${qs.toString()}`;
    const { resp, body, used } = await upstreamFetch(searchUrl);

    // Convert Realie 404 "no results" into empty list (easier for client)
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
