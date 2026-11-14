// A stand-in for Pocket's public API (https://public.heypocketai.com/api/v1/public), for local
// tests only, with invented recordings. GET /recordings (the list: titles and times, no
// summaries) and GET /recordings/{id} (Pocket's summary and the transcript). Test hooks:
// GET /__state (which recordings were read in full), POST /__add (a new recording), POST /__reset.
//
//   node scripts/mocks/pocket.mjs [port, default 4032]
//   key: "pk_test_meetings_key_1234" (Bearer)
import http from "node:http";

const port = Number(process.argv[2] || 4032);
const KEY = "pk_test_meetings_key_1234";
const BASE = "/api/v1/public";

const ago = (min) => new Date(Date.now() - min * 60_000).toISOString();

const seed = () => [
  {
    id: "rec-friday-close",
    title: "Closing on Fridays",
    createdAt: ago(40),
    duration: 184,
    summary:
      "## Summary\n- Fridays are the slowest day for closing, so the team should **book callbacks** for Monday morning before 5 PM.\n- Every rep sets two callbacks before leaving.\n- Mark checks the callback list at 4:30.",
    transcript: [
      { speaker: "Speaker 1", text: "Fridays are slow for closing, everybody knows it." },
      { speaker: "Speaker 1", text: "So before five, book your callbacks for Monday morning. Two each before you leave." },
      { speaker: "Speaker 1", text: "Mark is going to look at the callback list at four thirty." },
    ],
  },
  {
    id: "rec-website",
    title: "An idea for the website",
    createdAt: ago(300),
    duration: 52,
    summary: "A quote button at the top of the agency website, so a loan officer can send a client straight to it.",
    transcript: [{ speaker: "Speaker 1", text: "Put a quote button at the top of the website for loan officers." }],
  },
  {
    id: "rec-pending",
    title: "",
    createdAt: ago(2),
    duration: 30,
    summary: "",
    transcript: [],
  },
];

let recs = seed();
const read = new Set();

const listRow = (r) => ({ id: r.id, title: r.title, createdAt: r.createdAt, duration: r.duration });
const detail = (r) => ({
  data: {
    recording: listRow(r),
    transcript: { segments: r.transcript },
    summarizations: r.summary ? { "sum-1": { v2: { summary: { markdown: r.summary } } } } : {},
  },
});

function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === "/__state") return send(res, 200, { read: [...read] });
    if (url.pathname === "/__reset" && req.method === "POST") {
      recs = seed();
      read.clear();
      return send(res, 200, { ok: true });
    }
    if (url.pathname === "/__add" && req.method === "POST") {
      let raw = "";
      for await (const c of req) raw += c;
      const r = JSON.parse(raw || "{}");
      recs.unshift({ id: r.id, title: r.title ?? "", createdAt: r.createdAt ?? ago(0), duration: r.duration ?? 60, summary: r.summary ?? "", transcript: r.transcript ?? [] });
      return send(res, 200, { ok: true });
    }
    if ((req.headers.authorization ?? "") !== `Bearer ${KEY}`) return send(res, 401, { error: "unauthorized" });
    if (url.pathname === `${BASE}/recordings`) {
      const start = url.searchParams.get("start_date") ?? "1970-01-01";
      return send(res, 200, { data: recs.filter((r) => r.createdAt.slice(0, 10) >= start).map(listRow) });
    }
    const m = url.pathname.match(new RegExp(`^${BASE}/recordings/([^/]+)$`));
    if (m) {
      const r = recs.find((x) => x.id === decodeURIComponent(m[1]));
      if (!r) return send(res, 404, { error: "not found" });
      read.add(r.id);
      return send(res, 200, detail(r));
    }
    send(res, 404, { error: "not found" });
  })
  .listen(port, "127.0.0.1", () => console.log(`pocket mock on :${port}`));
