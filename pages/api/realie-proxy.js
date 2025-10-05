// pages/api/realie-proxy.js

const REALIE_BASE = "https://app.realie.ai/api/public/property/search"; // no trailing slash
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization,x-api-key");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method Not Allowed" });

  const {
    state, county, city, zipCode, address, unitNumberStripped,
    limit = "1", offset = "0", residential = "true",
  } = req.query || {};

  if (!state) return res.status(400).json({ error: "`state` is required" });

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

  const rawKey = process.env.REALIE_API_KEY || "";
  if (!rawKey) {
    return res.status(500).json({ error: "REALIE_API_KEY is not set in Vercel env" });
  }

  // Try both common auth styles
  const headersList = [
    {
      Accept: "application/json",
      Authorization: rawKey.startsWith("Bearer ") ? rawKey : `Bearer ${rawKey}`,
    },
    {
      Accept: "application/json",
      "x-api-key": rawKey, // some backends use this
    },
  ];

  try {
    // attempt Authorization first, then x-api-key
    let r, lastText;
    for (const headers of headersList) {
      r = await fetch(upstream, { headers, cache: "no-store" });
      lastText = await r.text();
      if (r.ok || r.status !== 401) break; // stop if success or error not auth-related
    }

    // return exactly what Realie returned
    res
      .status(r.status)
      .setHeader("Content-Type", r.headers.get("content-type") || "application/json")
      .send(lastText);
  } catch (e) {
    res.status(500).json({ error: e?.message || "proxy error" });
  }
}
