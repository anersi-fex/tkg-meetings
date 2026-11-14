// A stand-in for the Claude API's POST /v1/messages, for local tests only (point the app at it
// with ANTHROPIC_BASE_URL). It checks the request has the shape the app promises (the model,
// structured output, adaptive thinking, the cached system prompt) and answers a draft picked by
// keywords in the card. Test hooks: GET /__requests (the checks per request, no text).
//
//   node scripts/mocks/claude.mjs [port, default 4031]
//   key: anything starting "sk-ant-test-"; a card titled with "FAIL" gets a 500.
import http from "node:http";

const port = Number(process.argv[2] || 4031);
const seen = [];

const DRAFTS = [
  {
    when: /90-day|comp increase/i,
    out: {
      section: "Your raise",
      slides: [
        { layout: "big_news", statement: "Everybody’s getting a raise.", line: "Newer people get theirs after 90 working days.", notes: "You say: You’re all getting an increase in comp." },
        { layout: "big_number", title: "The 90-day rule", number: "90", label: "working days", pill: "[X]% raise on commission · TBD", lines: ["**Logged in** and in the office.", "**Not** from your hire date.", "Your raise starts **the next day.**"], notes: "You say: 90 working days. Open: the percentage." },
      ],
      quote_candidates: [],
    },
  },
  {
    when: /order for writing/i,
    out: {
      section: "Writing order",
      slides: [
        {
          layout: "step_chain",
          title: "The order for writing a policy",
          subtitle: "When a client qualifies, go down the list.",
          steps: [
            { name: "Newbridge", note: "", person: "none", last_resort: false },
            { name: "AHL", note: "", person: "none", last_resort: false },
            { name: "American Amicable", note: "", person: "none", last_resort: false },
            { name: "Me", note: "Bring it to me", person: "owner", last_resort: false },
            { name: "Mark", note: "", person: "mark", last_resort: false },
            { name: "Underwriting", note: "Only when nothing else works", person: "none", last_resort: true },
          ],
          notes: "You say: Newbridge first, then AHL, then American Amicable.",
        },
      ],
      quote_candidates: [],
    },
  },
  {
    when: /underwriting callback/i,
    out: {
      section: "Underwriting",
      slides: [
        {
          layout: "script",
          title: "When underwriting calls",
          subtitle: "Say this before you hang up.",
          rows: [
            { who: "rep", text: "Underwriting will call you from a number you don’t know.", aside: "" },
            { who: "rep", text: "Save this number as James, the insurance guy.", aside: "" },
            { who: "client", text: "They save it.", aside: "then just ask" },
          ],
          notes: "You say: Tell them underwriting will call.",
        },
      ],
      quote_candidates: [],
    },
  },
  {
    when: /equipment/i,
    out: {
      section: "Equipment",
      slides: [
        {
          layout: "price_cards",
          title: "What your setup cost",
          subtitle: "Take care of it.",
          cards: [
            { icon: "headphones", number: "$180", label: "Headset", highlight: false },
            { icon: "mini_pc", number: "$650", label: "Mini PC", highlight: true },
            { icon: "keyboard", number: "$90", label: "Keyboard", highlight: false },
            { icon: "monitor", number: "$240", label: "Monitor", highlight: false },
          ],
          strip: "",
          strip_icon: "none",
          notes: "You say: The office bought new gear for everyone.",
        },
      ],
      quote_candidates: [],
    },
  },
  {
    when: /outshine/i,
    out: {
      section: "Outshine me",
      slides: [{ layout: "key_line", statement: "I want you to\noutshine me.", coral: "outshine", line: "Build your own business here.", notes: "You say: I want every one of you to be better than me." }],
      quote_candidates: ["I want you to outshine me.", "A line he never said in quotes."],
    },
  },
  {
    // A Pocket recording: matched on words only its transcript has, so the test proves the
    // transcript reached Claude (scripts/mocks/pocket.mjs, "Closing on Fridays").
    when: /book your callbacks/i,
    out: {
      section: "Fridays",
      slides: [{ layout: "key_line", statement: "Two callbacks\nbefore you leave.", coral: "callbacks", line: "Mark checks the list at 4:30.", notes: "You say: Fridays are slow. Book Monday morning before five." }],
      quote_candidates: [],
    },
  },
];

function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json", "request-id": `req_mock_${Date.now()}` });
  res.end(JSON.stringify(body));
}

function message(model, text) {
  return {
    id: `msg_mock_${Date.now()}`,
    type: "message",
    role: "assistant",
    model,
    content: [{ type: "text", text }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 1200, output_tokens: 300, cache_creation_input_tokens: 0, cache_read_input_tokens: seen.length > 1 ? 4000 : 0 },
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  if (url.pathname === "/__requests") return send(res, 200, seen);
  if (url.pathname !== "/v1/messages" || req.method !== "POST") return send(res, 404, { type: "error", error: { type: "not_found_error", message: "not found" } });
  const key = req.headers["x-api-key"] ?? "";
  if (!String(key).startsWith("sk-ant-test-")) return send(res, 401, { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } });
  let raw = "";
  for await (const chunk of req) raw += chunk;
  const body = JSON.parse(raw);
  const user = JSON.stringify(body.messages ?? []);
  const format = body.output_config?.format;
  seen.push({
    model: body.model,
    beta: String(req.headers["anthropic-beta"] ?? ""),
    structured: format?.type === "json_schema",
    thinking: body.thinking?.type ?? null,
    effort: body.output_config?.effort ?? null,
    cachedSystem: Array.isArray(body.system) && body.system.some((b) => b.cache_control?.type === "ephemeral"),
    fallbacks: body.fallbacks ?? null,
  });
  if (!format) return send(res, 200, message(body.model, "ok"));
  if (/FAIL/.test(user)) return send(res, 500, { type: "error", error: { type: "api_error", message: "mock failure" } });
  const hit = DRAFTS.find((d) => d.when.test(user));
  const out = hit?.out ?? { section: "Housekeeping", slides: [{ layout: "key_line", statement: "Keep it simple.", coral: "simple", line: "", notes: "You say: Keep it simple." }], quote_candidates: [] };
  return send(res, 200, message(body.model, JSON.stringify(out)));
});

server.listen(port, "127.0.0.1", () => console.log(`mock Claude on http://127.0.0.1:${port}`));
