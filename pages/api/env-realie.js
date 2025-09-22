export default function handler(req, res) {
  const k = process.env.REALIE_API_KEY || '';
  res.status(200).json({ hasKey: !!k, length: k.length, tail: k.slice(-4) });
}
