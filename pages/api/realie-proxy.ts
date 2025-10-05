// pages/api/realie-proxy.ts
import type { NextApiRequest, NextApiResponse } from "next"

const REALIE_BASE = "https://app.realie.ai/api/public/property/search" // no trailing slash

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN ?? "*" // tighten in prod

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN)
  res.setHeader("Vary", "Origin")
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization")
  if (req.method === "OPTIONS") return res.status(204).end()
  if (req.method !== "GET") return res.status(405).json({ error: "Method Not Allowed" })

  const {
    state, county, city, zipCode, address, unitNumberStripped,
    limit = "1", offset = "0", residential = "true",
  } = req.query as Record<string, string | undefined>

  if (!state) return res.status(400).json({ error: "`state` is required" })

  const qs = new URLSearchParams()
  qs.set("state", state)
  if (county) qs.set("county", county)
  if (city) qs.set("city", city)
  if (zipCode) qs.set("zipCode", zipCode)
  if (address) qs.set("address", address)
  if (unitNumberStripped) qs.set("unitNumberStripped", unitNumberStripped)
  qs.set("limit", limit)
  qs.set("offset", offset)
  qs.set("residential", residential)

  const upstream = `${REALIE_BASE}?${qs.toString()}`
  const headers: Record<string,string> = { Accept: "application/json" }

  // Realie usually expects "Authorization: Bearer <KEY>"
  const key = process.env.REALIE_API_KEY
  if (key) headers.Authorization = key.startsWith("Bearer ") ? key : `Bearer ${key}`

  const r = await fetch(upstream, { headers, cache: "no-store" })
  const text = await r.text()
  res.status(r.status).setHeader("Content-Type", r.headers.get("content-type") || "application/json").send(text)
}
