// A stand-in for Command Center's connector (anersi-fex/tkg-pocket-ai POST /api/mcp), for local
// tests only. It answers tkg_notebook (the Team meeting folder) and tkg_move_card, with invented
// cards. Test hooks: GET /__state (what was marked done), POST /__reset.
//
//   node scripts/mocks/command-center.mjs [port, default 4030]
//   token: "test-cc-token" (Bearer, or ?token= on the URL like the claude.ai connector)
import http from "node:http";

const port = Number(process.argv[2] || 4030);
const TOKEN = "test-cc-token";

const seed = () => [
  {
    id: "card-raise",
    title: "Comp increase and the 90-day rule",
    summary: "Everyone is getting a raise in comp. Newer people get it after 90 working days.",
    points: ["90 working days logged in and in the office, not 90 days from the hire date.", "The raise starts the next day.", "The percentage on commission is still open."],
    people: [],
    last_said_at: "2026-11-12T13:05:00Z",
  },
  {
    id: "card-order",
    title: "The order for writing a policy",
    summary: "When a client qualifies, go in this order.",
    points: ["Newbridge first.", "Then AHL.", "Then American Amicable.", "Then bring it to me, then Mark.", "Underwriting is the last resort."],
    people: ["Mark"],
    last_said_at: "2026-11-12T13:07:00Z",
  },
  {
    id: "card-script",
    title: "Underwriting callback script",
    summary: "What to say when underwriting needs to call the client.",
    points: ["Tell them underwriting will call from a number they don't know.", "Say: \"Save this number as James, the insurance guy.\"", "Then just ask if they have any questions."],
    people: [],
    last_said_at: "2026-11-12T13:09:00Z",
  },
  {
    id: "card-equipment",
    title: "What the equipment costs",
    summary: "The office bought new gear for everyone.",
    points: ["Headset $180.", "Mini PC $650.", "Keyboard $90.", "Monitor $240."],
    people: [],
    last_said_at: "2026-11-12T13:11:00Z",
  },
  {
    id: "card-outshine",
    title: "Outshine me",
    summary: "I want every one of you to be better than me at this.",
    points: ["\"I want you to outshine me.\"", "Build your own business here."],
    people: [],
    last_said_at: "2026-11-12T13:13:00Z",
  },
];

let open = seed();
let done = [];

function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

function result(id, value, isError = false) {
  return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value) }], isError } };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  if (url.pathname === "/__state") return send(res, 200, { open: open.map((c) => c.id), done });
  if (url.pathname === "/__reset" && req.method === "POST") {
    open = seed();
    done = [];
    return send(res, 200, { ok: true });
  }
  if (url.pathname !== "/api/mcp" || req.method !== "POST") return send(res, 404, { error: "not found" });
  const auth = req.headers.authorization ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : (url.searchParams.get("token") ?? "");
  if (token !== TOKEN) return send(res, 401, { error: "unauthorized" });
  let body = "";
  for await (const chunk of req) body += chunk;
  let msg;
  try {
    msg = JSON.parse(body);
  } catch {
    return send(res, 400, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } });
  }
  if (msg.method !== "tools/call") return send(res, 200, { jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: "method not found" } });
  const { name, arguments: args = {} } = msg.params ?? {};
  if (name === "tkg_notebook") {
    if (args.group !== "team") return send(res, 200, result(msg.id, { notes: [] }));
    // Newest first, as Command Center lists them.
    const notes = [...open].sort((a, b) => b.last_said_at.localeCompare(a.last_said_at)).slice(0, Number(args.limit) || 100).map((c) => ({ ...c, said_times: 1, groups: ["team"], status: "open" }));
    return send(res, 200, result(msg.id, { notes }));
  }
  if (name === "tkg_move_card") {
    const card = open.find((c) => c.id === args.id);
    if (!card) return send(res, 200, result(msg.id, { error: "No card with that id." }));
    if (args.status === "done") {
      open = open.filter((c) => c.id !== args.id);
      done.push(args.id);
    }
    return send(res, 200, result(msg.id, { ok: true, id: args.id }));
  }
  return send(res, 200, result(msg.id, `Unknown tool: ${name}`, true));
});

server.listen(port, "127.0.0.1", () => console.log(`mock Command Center on http://127.0.0.1:${port}/api/mcp`));
