// A stand-in for DialRush's sign-in and MCP server (https://dialrush.com/mcp), for local tests
// only, with invented numbers. OAuth 2.1: metadata, dynamic registration, an authorize page that
// approves at once, PKCE-checked tokens and refresh. MCP: initialize, then tools/call get_stats
// (answered as a server-sent event, like a streaming server). The live key dr_live_test_key_12345
// is accepted as a bearer token too. Test hooks: GET /__state, POST /__set
// ({ connects, dials, appointments }), POST /__expire (every access token stops working), POST /__revoke (every token, refresh
// tokens too), POST /__reset.
//
//   node scripts/mocks/dialrush.mjs [port, default 4033]
import http from "node:http";
import { createHash } from "node:crypto";

const port = Number(process.argv[2] || 4033);
const base = `http://127.0.0.1:${port}`;
const b64url = (b) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

let today = { dials: 140, connects: 37, appointments: 2, talkSeconds: 1800 };
const codes = new Map();
const tokens = new Set();
const refresh = new Set();
const calls = [];
let refreshes = 0;
let issued = 0; // never reset: every token string is new, so a spent one can't pass by accident

function send(res, status, body, headers = {}) {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(body === undefined ? "" : JSON.stringify(body));
}
async function bodyOf(req) {
  let raw = "";
  for await (const c of req) raw += c;
  return raw;
}
const stats = (range) => {
  const t = range === "7d" ? { dials: 629, connects: 79, talkSeconds: 5395 } : today;
  const appts = range === "7d" ? 7 : today.appointments;
  return { team: { ...t }, dispositions: [{ dispositionName: "Appointment", count: appts }, { dispositionName: "Hung Up", count: 3 }], agents: [] };
};

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, base);
    if (url.pathname === "/__state") return send(res, 200, { calls, tokens: tokens.size, refreshes });
    if (url.pathname === "/__expire" && req.method === "POST") {
      tokens.clear();
      return send(res, 200, { ok: true });
    }
    if (url.pathname === "/__revoke" && req.method === "POST") {
      tokens.clear();
      refresh.clear();
      return send(res, 200, { ok: true });
    }
    if (url.pathname === "/__reset" && req.method === "POST") {
      today = { dials: 140, connects: 37, appointments: 2, talkSeconds: 1800 };
      codes.clear();
      tokens.clear();
      refresh.clear();
      calls.length = 0;
      refreshes = 0;
      return send(res, 200, { ok: true });
    }
    if (url.pathname === "/__set" && req.method === "POST") {
      today = { ...today, ...JSON.parse((await bodyOf(req)) || "{}") };
      return send(res, 200, { ok: true });
    }
    if (url.pathname === "/.well-known/oauth-authorization-server")
      return send(res, 200, { issuer: base, authorization_endpoint: `${base}/authorize`, token_endpoint: `${base}/token`, registration_endpoint: `${base}/register`, code_challenge_methods_supported: ["S256"], token_endpoint_auth_methods_supported: ["none"] });
    if (url.pathname === "/register" && req.method === "POST") {
      const b = JSON.parse((await bodyOf(req)) || "{}");
      // As DialRush (checked 2026-11-15): only Claude's own callback or a loopback address whose path is /callback.
      const ok = (u) => /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/callback$/.test(u) || u === "https://claude.ai/api/mcp/auth_callback";
      if (!Array.isArray(b.redirect_uris) || !b.redirect_uris.length || !b.redirect_uris.every(ok)) return send(res, 400, { error: "invalid_redirect_uri", error_description: "Only Claude's own callback or a loopback address" });
      return send(res, 201, { client_id: "mock-client", redirect_uris: b.redirect_uris });
    }
    if (url.pathname === "/authorize") {
      const p = url.searchParams;
      if (p.get("code_challenge_method") !== "S256" || p.get("client_id") !== "mock-client") return send(res, 400, { error: "invalid_request" });
      const code = `code-${codes.size + 1}`;
      codes.set(code, { challenge: p.get("code_challenge"), redirect: p.get("redirect_uri") });
      res.writeHead(302, { location: `${p.get("redirect_uri")}?code=${code}&state=${encodeURIComponent(p.get("state") ?? "")}` });
      return res.end();
    }
    if (url.pathname === "/token" && req.method === "POST") {
      const f = new URLSearchParams(await bodyOf(req));
      if (f.get("grant_type") === "authorization_code") {
        const c = codes.get(f.get("code"));
        if (!c || c.redirect !== f.get("redirect_uri") || b64url(createHash("sha256").update(f.get("code_verifier") ?? "").digest()) !== c.challenge) return send(res, 400, { error: "invalid_grant" });
        codes.delete(f.get("code"));
      } else if (f.get("grant_type") === "refresh_token") {
        if (!refresh.has(f.get("refresh_token"))) return send(res, 400, { error: "invalid_grant" });
        refresh.delete(f.get("refresh_token")); // rotated: a refresh token works once
        refreshes++;
      } else return send(res, 400, { error: "unsupported_grant_type" });
      issued++;
      const access = `at-${issued}`;
      const rt = `rt-${issued}`;
      tokens.add(access);
      refresh.add(rt);
      return send(res, 200, { access_token: access, token_type: "Bearer", expires_in: 3600, refresh_token: rt });
    }
    if (url.pathname === "/mcp" && req.method === "POST") {
      const auth = (req.headers.authorization ?? "").replace(/^Bearer /, "");
      if (!tokens.has(auth) && auth !== "dr_live_test_key_12345") return send(res, 401, { error: "invalid_token" }, { "www-authenticate": `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource/mcp"` });
      const msg = JSON.parse((await bodyOf(req)) || "{}");
      if (msg.method === "initialize") return send(res, 200, { jsonrpc: "2.0", id: msg.id, result: { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "mock-dialrush", version: "1" } } }, { "mcp-session-id": "s-1" });
      if (msg.method === "notifications/initialized") return send(res, 202);
      if (msg.method === "tools/call" && msg.params?.name === "get_stats") {
        calls.push(msg.params.arguments);
        const out = { jsonrpc: "2.0", id: msg.id, result: { content: [{ type: "text", text: JSON.stringify(stats(msg.params.arguments?.range)) }] } };
        // As a streaming server may: a keep-alive comment and an unrelated notification first.
        res.writeHead(200, { "content-type": "text/event-stream" });
        return res.end(`: keep-alive\n\nevent: message\ndata: {"jsonrpc":"2.0","method":"notifications/progress","params":{}}\n\nevent: message\ndata: ${JSON.stringify(out)}\n\n`);
      }
      return send(res, 200, { jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: "unknown" } });
    }
    send(res, 404, { error: "not found" });
  })
  .listen(port, "127.0.0.1", () => console.log(`dialrush mock on :${port}`));
