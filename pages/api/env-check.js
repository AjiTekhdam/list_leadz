export default function handler(req, res) {
  const k = process.env.ATTOM_API_KEY || "";
  // Don't print the key; just show length and last 4 chars for sanity.
  return res.status(200).json({ hasKey: !!k, length: k.length, tail: k.slice(-6) });
}
