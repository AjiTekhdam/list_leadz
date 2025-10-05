// pages/api/realie-proxy.js

const REALIE_BASE = "https://app.realie.ai/api/public/property/search"; // no trailing slash
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization,x-api-key,X-API-Key");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method Not Allowed" });

  // Optional echo to confirm envs (safe; masks key)
  if (req.query.__echo === "1") {
    const raw = process.env.REALIE_API_KEY || "";
    return res.status(200).json({
      hasKey: !!raw,
      keyLength: raw.length,
      triedStyles: ["Authorization: Bearer <key>", "Authorization: <key>", "x-api-key", "X-API-Key"],
      base: REALIE_BASE,
      note: "Remove __echo before going live.",
    });
  }

  const {
    state, county, city, zipCode, address, unitNumberStripped,
    limit = "1", offset = "0", residential = "true",
  } = req.query || {};

  if (!state) return res.status(400).json({ error: "`state` is required" });

  // Build upstream URL
  const qs = new URLSearchParams();
  qs.set("state", state);
  if (county) qs.set("county", county);
  if (city) qs.set("city", city);
  if (zipCode) qs.set("zipCode", zipCode);
  if (address) qs.set("address", address);
  if (unitNumberStripped) qs.set("unitNumberStripped", unitNumberStripped);
  qs.set("limit", limit);
  qs.set("offset", offset);
  qs.set("residential", residential);

  const upstream = `${REALIE_BASE}?${qs.toString()}`;

  // Env key
  const rawKey = process.env.REALIE_API_KEY || "";
  if (!rawKey) {
    return res.status(500).json({ error: "REALIE_API_KEY not set on Vercel" });
  }

  // Try multiple common auth header styles in order
  const headerVariants = [
    { style: "auth-bearer", headers: { Accept: "application/json", Authorization: rawKey.startsWith("Bearer ") ? rawKey : `Bearer ${rawKey}` } },
    { style: "auth-raw",    headers: { Accept: "application/json", Authorization: rawKey } },
    { style: "x-api-key",   headers: { Accept: "application/json", "x-api-key": rawKey } },
    { style: "X-API-Key",   headers: { Accept: "application/json", "X-API-Key": rawKey } },
  ];

  try {
    let usedStyle = "none";
    let r, body;

    for (const v of headerVariants) {
      r = await fetch(upstream, { headers: v.headers, cache: "no-store" });
      body = await r.text();

      // If success OR not an auth error, stop trying further variants
      if (r.ok || (r.status !== 401 && r.status !== 403)) {
        usedStyle = v.style;
        break;
      }

      // Keep the last body around; continue to next style
      usedStyle = v.style + " (unauthorized)";
    }

    // Pass-through Realie's response
    res.setHeader("x-auth-style", usedStyle);
    res
      .status(r.status)
      .setHeader("Content-Type", r.headers.get("content-type") || "application/json")
      .send(body);
  } catch (e) {
    res.status(500).json({ error: e?.message || "proxy error" });
  }
}
