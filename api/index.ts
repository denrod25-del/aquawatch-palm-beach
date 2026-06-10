// Zero-dependency test — no imports at all
export default function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");
  res.statusCode = 200;
  res.end(JSON.stringify({ status: "ok", path: req.url, ts: Date.now() }));
}
