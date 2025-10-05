// pages/api/env-check.js

export default function handler(req, res) {
  res.status(200).json({
    hasKey: !!process.env.REALIE_API_KEY,
    keyLength: process.env.REALIE_API_KEY
      ? process.env.REALIE_API_KEY.length
      : 0,
    previewEnv: process.env.VERCEL_ENV || "unknown",
    project: process.env.VERCEL_PROJECT_PRODUCTION_URL || "unknown",
  });
}
