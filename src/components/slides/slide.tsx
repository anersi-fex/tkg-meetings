import type { CSSProperties, ReactNode } from "react";
import {
  cardIconsShow,
  ringShares,
  type AgendaSlide,
  type BigNewsSlide,
  type BigNumberSlide,
  type ChartSlide,
  type CoverSlide,
  type DiagramSlide,
  type DrawnSlide,
  type IconKey,
  type KeyLineSlide,
  type PersonKey,
  type PriceCardsSlide,
  type QuoteSlide,
  type ScoreboardSlide,
  type ScriptSlide,
  type StepChainSlide,
} from "@/lib/slides";

/**
 * One slide of the approved slide brand (brand/SLIDES.md and its templates in brand/slides/),
 * drawn on the 1920 by 1080 canvas. Every size is a canvas pixel times --u (globals.css), so the
 * same slide fills the office TV, the clicker and a phone thumbnail. The colors are the guide's
 * fixed hex values: slides look the same in the app's light and dark modes.
 *
 * No hooks: renders on the server and in the browser. `uid` keeps SVG gradient ids unique when
 * several slides share a page.
 */

const u = (n: number) => `calc(var(--u) * ${n})`;

const C = {
  bg: "#0b0d12",
  card: "#141823",
  raised: "#1b2030",
  line: "#262c3b",
  rail: "#2e3445",
  arrow: "#4a5268",
  ring: "#3a4256",
  text: "#eef0f5",
  text2: "#c3c8d4",
  muted: "#a3a9b8",
  quiet: "#8c93a5",
  eyebrow: "#ff8a78",
  coral: "#ff6b57",
  grad: "linear-gradient(135deg, #e5484d, #ff8a5c)",
  gradBar: "linear-gradient(90deg, #e5484d, #ff8a5c)",
  red: "linear-gradient(135deg, #9e2229 0%, #c42b32 55%, #e04a43 100%)",
  onRed: "#fff6f4",
  onRed2: "#ffe4df",
  glow: "radial-gradient(circle at 82% 22%, #2c1416 0%, #0b0d12 58%)",
} as const;

const SANS = "'Plus Jakarta Sans Variable', 'Plus Jakarta Sans', Arial, sans-serif";
const MONO = "'Space Grotesk Variable', 'Space Grotesk', Arial, sans-serif";

const BUBBLE =
  "M296 208H728A128 128 0 0 1 856 336V600A128 128 0 0 1 728 728H472L300 846Q268 866 268 828V728H296A128 128 0 0 1 168 600V336A128 128 0 0 1 296 208Z M334 384h356a22 22 0 0 1 0 44H334a22 22 0 0 1 0-44z M334 468h276a22 22 0 0 1 0 44H334a22 22 0 0 1 0-44z M334 552h188a22 22 0 0 1 0 44H334a22 22 0 0 1 0-44z";
const TKG =
  "M30 39H542V204H368V684H203V204H30ZM570 41H734V253L887 41H1084V47L865 350L1084 648V682H906L766 491L570 763ZM1569 160A323 323 0 1 0 1305 677H1560V294H1259V458H1396V513H1305A160 160 0 1 1 1449 268Z";
const HEADSET =
  "M12 3a8 8 0 0 0-8 8v5.5A2.5 2.5 0 0 0 6.5 19H8a1 1 0 0 0 1-1v-5a1 1 0 0 0-1-1H6v-1a6 6 0 0 1 12 0v1h-2a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1h2v.5a1 1 0 0 1-1 1h-3a1 1 0 1 0 0 2h3a3 3 0 0 0 3-3V11a8 8 0 0 0-8-8z";
const PERSON = "M12 12a4.2 4.2 0 1 0 0-8.4 4.2 4.2 0 0 0 0 8.4zm0 2c-4.4 0-7.5 2.3-7.5 5v1.4h15V19c0-2.7-3.1-5-7.5-5z";

// --- Text pieces ---------------------------------------------------------------------------------

/** "**word**" marks the key words of a talking line: bold and white, the rest stays as it is. */
function Marked({ text, bold = C.text }: { text: string; bold?: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") ? (
          <b key={i} style={{ color: bold, fontWeight: 800 }}>
            {p.slice(2, -2)}
          </b>
        ) : (
          <span key={i}>{p.replace(/\*\*/g, "")}</span>
        ),
      )}
    </>
  );
}

/** A statement with its one coral word and its hand line breaks ("\n"). */
function Statement({ text, coral }: { text: string; coral?: string }) {
  const lines = text.split("\n");
  // The coral word colors on the first line that holds it.
  const coralLine = coral ? lines.findIndex((l) => l.includes(coral)) : -1;
  return (
    <>
      {lines.map((line, li) => {
        let body: ReactNode = line;
        if (coral && li === coralLine) {
          const at = line.indexOf(coral);
          {
            body = (
              <>
                {line.slice(0, at)}
                <span style={{ color: C.coral }}>{coral}</span>
                {line.slice(at + coral.length)}
              </>
            );
          }
        }
        return (
          <span key={li}>
            {li > 0 && <br />}
            {body}
          </span>
        );
      })}
    </>
  );
}

function Eyebrow({ children, red }: { children: ReactNode; red?: boolean }) {
  return (
    <p style={{ fontSize: u(26), fontWeight: 800, letterSpacing: u(4), textTransform: "uppercase", color: red ? C.onRed2 : C.eyebrow, lineHeight: 1.2 }}>
      {children}
    </p>
  );
}

function Header({ eyebrow, title, subtitle }: { eyebrow?: string; title: string; subtitle?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: u(16) }}>
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <h2 style={{ fontSize: u(96), fontWeight: 800, lineHeight: 1.05, letterSpacing: u(-3), color: C.text }}>{title}</h2>
      {subtitle ? <p style={{ fontSize: u(36), fontWeight: 600, lineHeight: 1.4, color: C.muted }}>{subtitle}</p> : null}
    </div>
  );
}

const pillStyle = (size: 26 | 36, tone: "tbd" | "green" | "gray"): CSSProperties => ({
  alignSelf: "flex-start",
  fontSize: u(size),
  fontWeight: 800,
  whiteSpace: "nowrap",
  borderRadius: u(999),
  padding: size === 26 ? `${u(8)} ${u(20)}` : `${u(14)} ${u(32)}`,
  color: tone === "tbd" ? "#fcd34d" : tone === "green" ? "#86efac" : C.text2,
  background: tone === "tbd" ? "#3d2a0a" : tone === "green" ? "#143221" : C.line,
});

function Badge({ n, gray }: { n: number; gray?: boolean }) {
  return (
    <p
      style={{
        flex: "none",
        width: u(64),
        height: u(64),
        borderRadius: u(18),
        fontFamily: MONO,
        fontSize: u(36),
        fontWeight: 700,
        lineHeight: u(64),
        textAlign: "center",
        color: gray ? C.text2 : C.bg,
        background: gray ? C.line : C.grad,
      }}
    >
      {n}
    </p>
  );
}

function Dot() {
  return (
    <div style={{ padding: `${u(24)} 0 0 0`, flex: "none" }}>
      <div style={{ width: u(20), height: u(20), borderRadius: u(10), background: C.grad }} />
    </div>
  );
}

const gradText: CSSProperties = { background: C.grad, backgroundClip: "text", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", color: C.coral };

// --- Marks ----------------------------------------------------------------------------------------

function MeetingsMark({ size, red }: { size: number; red?: boolean }) {
  return (
    <span
      aria-hidden
      style={{ display: "inline-flex", flex: "none", width: u(size), height: u(size), borderRadius: u(size * 0.275), background: red ? C.onRed : C.grad }}
    >
      <svg viewBox="0 0 1024 1024" style={{ width: u(size), height: u(size), display: "block" }}>
        <path fill={red ? "#c42b32" : C.onRed} fillRule="evenodd" d={BUBBLE} />
      </svg>
    </span>
  );
}

function TkgLetters({ height, color }: { height: number; color: string }) {
  return (
    <svg viewBox="30 30 1540 734" role="img" aria-label="TKG" style={{ height: u(height), width: u((height * 1540) / 734), display: "block", flex: "none" }}>
      <path fill={color} d={TKG} />
    </svg>
  );
}

function Footer({ slide, red }: { slide: DrawnSlide; red?: boolean }) {
  const num = slide.index && slide.total ? `${String(slide.index).padStart(2, "0")} / ${String(slide.total).padStart(2, "0")}` : "";
  return (
    <div style={{ position: "absolute", left: u(128), bottom: u(64), width: u(1664), height: u(40), display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ display: "flex", alignItems: "center", gap: u(14) }}>
        <MeetingsMark size={40} red={red} />
        <p style={{ fontSize: u(26), fontWeight: 700, whiteSpace: "nowrap", color: red ? C.onRed2 : C.text2 }}>
          Meetings <span style={{ color: red ? C.onRed2 : C.quiet }}>by</span>
        </p>
        <TkgLetters height={20} color={red ? C.onRed2 : C.text2} />
      </div>
      <p style={{ fontFamily: MONO, fontSize: u(26), fontWeight: 600, whiteSpace: "nowrap", color: red ? C.onRed2 : C.quiet }}>{num}</p>
    </div>
  );
}

const section = (background: string, extra: CSSProperties = {}): CSSProperties => ({
  position: "absolute",
  inset: 0,
  background,
  color: background === C.red ? C.onRed : C.text,
  fontFamily: SANS,
  padding: `${u(128)} ${u(128)} ${u(160)}`,
  display: "flex",
  flexDirection: "column",
  ...extra,
});

const Spacer = () => <div style={{ flex: 1 }} />;

// --- Icons ------------------------------------------------------------------------------------------

function LineIcon({ icon, size = 64 }: { icon: IconKey; size?: number }) {
  if (icon === "none") return null;
  const s = { stroke: C.eyebrow, strokeWidth: 5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" };
  const svg = (children: ReactNode, label: string) => (
    <svg viewBox="0 0 64 64" role="img" aria-label={label} style={{ width: u(size), height: u(size), display: "block", flex: "none" }}>
      {children}
    </svg>
  );
  switch (icon) {
    case "headphones":
      return svg(
        <>
          <path d="M12 38v-6a20 20 0 0 1 40 0v6" {...s} />
          <rect x="8" y="36" width="12" height="20" rx="5" fill={C.eyebrow} />
          <rect x="44" y="36" width="12" height="20" rx="5" fill={C.eyebrow} />
        </>,
        "Headphones",
      );
    case "mini_pc":
      return svg(
        <>
          <rect x="10" y="14" width="44" height="36" rx="8" {...s} />
          <circle cx="21" cy="40" r="3.5" fill={C.eyebrow} />
          <path d="M31 40h13" {...s} />
        </>,
        "Mini PC",
      );
    case "keyboard":
      return svg(
        <>
          <rect x="6" y="18" width="52" height="30" rx="7" {...s} />
          <path d="M16 28h2M24 28h2M32 28h2M40 28h2M48 28h0M20 38h24" {...s} />
        </>,
        "Keyboard",
      );
    case "mouse":
      return svg(
        <>
          <rect x="18" y="8" width="28" height="48" rx="14" {...s} />
          <path d="M32 16v10" {...s} />
        </>,
        "Mouse",
      );
    case "monitor":
      return svg(
        <>
          <path d="M6 14Q32 8 58 14V42Q32 36 6 42Z" {...s} />
          <path d="M32 40v12M22 54h20" {...s} />
        </>,
        "Monitor",
      );
  }
}

function SpeakerIcon({ who }: { who: "rep" | "client" }) {
  return (
    <svg viewBox="0 0 56 56" role="img" aria-label={who === "rep" ? "You" : "The client"} style={{ width: u(56), height: u(56), display: "block", flex: "none" }}>
      <circle cx="28" cy="28" r="28" fill={who === "rep" ? C.coral : C.text} />
      <g transform="translate(11.2 11.2) scale(1.4)">
        <path fill={who === "rep" ? C.onRed : C.bg} d={who === "rep" ? HEADSET : PERSON} />
      </g>
    </svg>
  );
}

function PersonCircle({ size, glyph }: { size: number; glyph: number }) {
  return (
    <div
      style={{
        width: u(size),
        height: u(size),
        flex: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: C.raised,
        border: `${u(2)} solid ${C.ring}`,
        borderRadius: u(size / 2),
      }}
    >
      <svg viewBox="0 0 24 24" aria-label="A teammate" role="img" style={{ width: u(glyph), height: u(glyph), display: "block" }}>
        <path fill={C.text2} d={PERSON} />
      </svg>
    </div>
  );
}

function ListAvatar({ who }: { who: PersonKey }) {
  if (who === "none") return null;
  if (who === "teammate") return <PersonCircle size={56} glyph={30} />;
  const owner = who === "owner";
  return (
    <p
      style={{
        flex: "none",
        width: u(56),
        height: u(56),
        borderRadius: u(28),
        fontSize: u(26),
        fontWeight: 800,
        lineHeight: u(56),
        textAlign: "center",
        color: owner ? "#fca5a5" : "#b4c4ff",
        background: owner ? "#3a1a1a" : "#1c2543",
      }}
    >
      {owner ? "AK" : "MD"}
    </p>
  );
}

function Arrow() {
  return <div aria-hidden style={{ width: u(72), height: u(36), flex: "none", background: C.arrow, clipPath: "polygon(0 30%, 60% 30%, 60% 0, 100% 50%, 60% 100%, 60% 70%, 0 70%)" }} />;
}

// --- Layouts ------------------------------------------------------------------------------------------

function Cover({ s }: { s: CoverSlide }) {
  return (
    <section style={section(C.red, { justifyContent: "space-between" })}>
      <svg viewBox="0 0 1024 1024" aria-hidden style={{ position: "absolute", left: u(1152), top: u(150), width: u(600), height: u(600), opacity: 0.14 }}>
        <path fill={C.onRed} fillRule="evenodd" d={BUBBLE} />
      </svg>
      <TkgLetters height={48} color={C.onRed} />
      <div style={{ display: "flex", flexDirection: "column", gap: u(32), position: "relative" }}>
        <Eyebrow red>{s.eyebrow}</Eyebrow>
        <h1 style={{ fontSize: u(176), fontWeight: 800, lineHeight: 1, letterSpacing: u(-6), color: C.onRed }}>{s.title}</h1>
        {s.line ? <p style={{ width: u(1120), fontSize: u(56), fontWeight: 600, lineHeight: 1.2, color: C.onRed2 }}>{s.line}</p> : null}
      </div>
      <p style={{ position: "absolute", left: u(128), bottom: u(64), width: u(1664), fontSize: u(26), fontWeight: 700, color: C.onRed2 }}>{s.footer}</p>
    </section>
  );
}

function Scoreboard({ s }: { s: ScoreboardSlide & DrawnSlide }) {
  return (
    <section style={section(C.bg, { gap: u(48) })}>
      <Header eyebrow={s.eyebrow} title={s.title} />
      <Spacer />
      <div style={{ display: "flex", flexDirection: "column", gap: u(32) }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: u(48) }}>
          <div style={{ display: "flex", flexDirection: "column", gap: u(12), minWidth: 0 }}>
            <p style={{ fontFamily: MONO, fontSize: u(176), fontWeight: 700, lineHeight: 1, letterSpacing: u(-6), color: C.text, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{s.number}</p>
            {s.line ? <p style={{ fontSize: u(36), fontWeight: 600, color: C.muted }}>{s.line}</p> : null}
          </div>
          {s.pill ? <p style={{ ...pillStyle(36, s.pillTone), alignSelf: "flex-end" }}>{s.pill}</p> : null}
        </div>
        {s.pct != null ? (
          <div style={{ height: u(28), background: C.raised, borderRadius: u(14), overflow: "hidden" }}>
            <div style={{ height: u(28), width: `${Math.max(0, Math.min(100, s.pct))}%`, background: C.gradBar, borderRadius: u(14) }} />
          </div>
        ) : null}
      </div>
      <Footer slide={s} />
    </section>
  );
}

function Agenda({ s }: { s: AgendaSlide & DrawnSlide }) {
  return (
    <section style={section(C.bg, { gap: u(48) })}>
      <Header eyebrow={s.eyebrow ?? "Today"} title={s.title} />
      <div style={{ display: "flex", flexDirection: "column", background: C.card, borderRadius: u(32), padding: `${u(16)} ${u(40)}` }}>
        {s.rows.map((row, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: u(32), padding: `${u(14)} 0`, borderTop: i ? `${u(2)} solid ${C.line}` : "none" }}>
            <Badge n={i + 1} />
            <p style={{ fontSize: u(56), fontWeight: 700, lineHeight: 1.2, color: C.text }}>{row}</p>
          </div>
        ))}
      </div>
      <Footer slide={s} />
    </section>
  );
}

function BigNews({ s }: { s: BigNewsSlide & DrawnSlide }) {
  return (
    <section style={section(C.red, { gap: u(40) })}>
      {s.eyebrow ? <Eyebrow red>{s.eyebrow}</Eyebrow> : null}
      <Spacer />
      <h1 style={{ fontSize: u(176), fontWeight: 800, lineHeight: 1, letterSpacing: u(-6), color: C.onRed }}>{s.statement}</h1>
      {s.line ? <p style={{ fontSize: u(56), fontWeight: 600, lineHeight: 1.2, color: C.onRed2 }}>{s.line}</p> : null}
      <Footer slide={s} red />
    </section>
  );
}

function BigNumber({ s }: { s: BigNumberSlide & DrawnSlide }) {
  return (
    <section style={section(C.bg, { gap: u(48) })}>
      <Header eyebrow={s.eyebrow} title={s.title} />
      <div style={{ flex: 1, display: "flex", alignItems: "stretch", gap: u(64), minHeight: 0 }}>
        <div style={{ width: u(620), flex: "none", display: "flex", flexDirection: "column", justifyContent: "center", gap: u(16), background: C.card, borderRadius: u(32), padding: u(48) }}>
          <p style={{ fontFamily: MONO, fontSize: u(176), fontWeight: 700, lineHeight: 1, letterSpacing: u(-6), whiteSpace: "nowrap", ...gradText }}>{s.number}</p>
          {s.label ? <p style={{ fontSize: u(36), fontWeight: 700, color: C.text2 }}>{s.label}</p> : null}
          {s.pill ? <p style={pillStyle(26, "tbd")}>{s.pill}</p> : null}
        </div>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center", gap: u(44) }}>
          {s.lines.map((line, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: u(28) }}>
              <Dot />
              <p style={{ fontSize: u(56), fontWeight: 500, lineHeight: 1.2, color: C.text2 }}>
                <Marked text={line} />
              </p>
            </div>
          ))}
        </div>
      </div>
      <Footer slide={s} />
    </section>
  );
}

const OPERATOR = /^(÷|=|×|\+|−|-|or)\s+/;

/** Where a slice's label sits: the middle of its arc on the ring's center line (r=200), in canvas px. */
function sliceLabelAt(start: number, share: number, rotate: number): { x: number; y: number } {
  const angle = ((rotate + ((start + (share - 1) / 2) / 100) * 360) * Math.PI) / 180;
  return { x: 260 + 200 * Math.cos(angle), y: 260 + 200 * Math.sin(angle) };
}

function Chart({ s, uid }: { s: ChartSlide & DrawnSlide; uid: string }) {
  const gradId = `pie-${uid}`;
  // Whole parts of 100 (sizes that add up to 90 or 110 are drawn to scale: no hole, no overlap).
  const shares = ringShares(s.slices.map((slice) => slice.share));
  const starts = shares.map((_, i) => shares.slice(0, i).reduce((a, b) => a + b, 0));
  const rotate = s.slices.length === 2 ? 180 : -90;
  const rings = s.slices.map((slice, i) => {
    const share = shares[i];
    const start = starts[i];
    if (share <= 0) return { ring: null, highlight: slice.highlight };
    const ring = (
      <circle
        key={i}
        cx="260"
        cy="260"
        r="200"
        fill="none"
        stroke={slice.highlight ? `url(#${gradId})` : i % 2 ? "#1d2230" : C.line}
        strokeWidth={slice.highlight && s.slices.length > 2 ? 116 : 104}
        pathLength={100}
        strokeDasharray={`${share - 1} ${101 - share}`}
        strokeDashoffset={-start}
        transform={`rotate(${rotate} 260 260)`}
      />
    );
    return { ring, highlight: slice.highlight };
  });
  // The highlighted slice is drawn last so its thicker ring sits on top.
  const ordered = [...rings.filter((r) => !r.highlight), ...rings.filter((r) => r.highlight)];
  const youCenter = /^you$/i.test(s.center.trim());
  return (
    <section style={section(C.bg, { gap: u(48) })}>
      <Header eyebrow={s.eyebrow} title={s.title} subtitle={s.subtitle} />
      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: u(96), minHeight: 0 }}>
        <div style={{ position: "relative", width: u(520), height: u(520), flex: "none" }}>
          <svg viewBox="0 0 520 520" role="img" aria-label="A ring cut into slices, one highlighted" style={{ width: u(520), height: u(520), display: "block" }}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#e5484d" />
                <stop offset="1" stopColor="#ff8a5c" />
              </linearGradient>
            </defs>
            {ordered.map((r) => r.ring)}
          </svg>
          {/* Labels inside the ring: 36px 800, light on a gray slice, dark on the highlighted one. */}
          {s.slices.map((slice, i) => {
            const text = slice.label.trim();
            if (!text || shares[i] <= 0) return null;
            const at = sliceLabelAt(starts[i], shares[i], rotate);
            return (
              <p
                key={i}
                style={{
                  position: "absolute",
                  left: u(at.x),
                  top: u(at.y),
                  transform: "translate(-50%, -50%)",
                  fontSize: u(36),
                  fontWeight: 800,
                  lineHeight: 1.2,
                  whiteSpace: "nowrap",
                  color: slice.highlight ? C.bg : C.text2,
                }}
              >
                {text}
              </p>
            );
          })}
          {s.center ? (
            <p
              style={{
                position: "absolute",
                left: u(160),
                width: u(200),
                top: youCenter ? u(226) : u(235),
                textAlign: "center",
                fontSize: u(youCenter ? 56 : 36),
                fontWeight: youCenter ? 800 : 600,
                lineHeight: 1.2,
                color: youCenter ? C.eyebrow : C.muted,
              }}
            >
              {s.center}
            </p>
          ) : null}
        </div>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: u(28) }}>
          {s.math.map((line, i) => {
            const m = line.match(OPERATOR);
            if (i === 0 && !m) return <p key={i} style={{ fontSize: u(56), fontWeight: 800, lineHeight: 1.2, color: C.text }}>{line}</p>;
            return (
              <p key={i} style={{ fontSize: u(56), fontWeight: 600, lineHeight: 1.2, color: C.text2 }}>
                {m ? (
                  <>
                    <b style={{ color: C.eyebrow }}>{m[1]}</b> {line.slice(m[0].length)}
                  </>
                ) : (
                  line
                )}
              </p>
            );
          })}
          {s.note || s.pill ? <div style={{ height: 0, borderTop: `${u(2)} solid ${C.line}`, width: u(880), maxWidth: "100%" }} /> : null}
          {s.note ? <p style={{ fontSize: u(36), fontWeight: 600, lineHeight: 1.4, color: C.muted }}>{s.note}</p> : null}
          {s.pill ? <p style={pillStyle(26, "tbd")}>{s.pill}</p> : null}
        </div>
      </div>
      <Footer slide={s} />
    </section>
  );
}

function KeyLine({ s }: { s: KeyLineSlide & DrawnSlide }) {
  return (
    <section style={section(C.glow, { gap: u(40) })}>
      {s.eyebrow ? <Eyebrow>{s.eyebrow}</Eyebrow> : null}
      <Spacer />
      <h1 style={{ fontSize: u(176), fontWeight: 800, lineHeight: 1, letterSpacing: u(-6), color: C.text }}>
        <Statement text={s.statement} coral={s.coral} />
      </h1>
      {s.line ? <p style={{ fontSize: u(56), fontWeight: 600, lineHeight: 1.2, color: C.text2 }}>{s.line}</p> : null}
      <Footer slide={s} />
    </section>
  );
}

const TIER_WIDTH = { owner: 340, team: 500, open: 460 } as const;

function Diagram({ s }: { s: DiagramSlide & DrawnSlide }) {
  return (
    <section style={section(C.bg, { gap: u(48) })}>
      <Header eyebrow={s.eyebrow} title={s.title} />
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: s.tiers.length > 2 ? "space-between" : "center", gap: u(s.tiers.length > 2 ? 24 : 96), minHeight: 0 }}>
        {s.tiers.map((t, i) => (
          <div key={i} style={{ display: "contents" }}>
            {i > 0 ? <Arrow /> : null}
            <div style={{ width: u(TIER_WIDTH[t.kind]), flex: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: u(20) }}>
              {t.kind === "owner" ? (
                <p style={{ width: u(160), height: u(160), borderRadius: u(80), fontSize: u(56), fontWeight: 800, lineHeight: u(160), textAlign: "center", color: C.bg, background: C.grad }}>AK</p>
              ) : t.kind === "team" ? (
                <div style={{ display: "flex", gap: u(20) }}>
                  {Array.from({ length: Math.max(1, Math.min(3, t.count)) }, (_, k) => (
                    <PersonCircle key={k} size={120} glyph={64} />
                  ))}
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(3, Math.max(1, t.count))}, ${u(76)})`, gap: u(20) }}>
                  {Array.from({ length: Math.max(1, Math.min(6, t.count)) }, (_, k) => (
                    <p key={k} style={{ width: u(76), height: u(76), borderRadius: u(38), border: `${u(2)} dashed ${C.arrow}`, fontSize: u(36), fontWeight: 700, lineHeight: u(72), textAlign: "center", color: C.quiet }}>
                      +
                    </p>
                  ))}
                </div>
              )}
              <p style={{ fontSize: u(36), fontWeight: 800, textAlign: "center", color: C.text }}>{t.label}</p>
            </div>
          </div>
        ))}
      </div>
      {s.rule || s.takeaway ? (
        <div style={{ display: "flex", flexDirection: "column", gap: u(12) }}>
          {s.rule ? <p style={{ fontSize: u(36), fontWeight: 600, lineHeight: 1.4, color: C.muted }}>{s.rule}</p> : null}
          {s.takeaway ? <p style={{ fontSize: u(56), fontWeight: 800, lineHeight: 1.2, color: C.text }}>{s.takeaway}</p> : null}
        </div>
      ) : null}
      <Footer slide={s} />
    </section>
  );
}

function PriceCards({ s }: { s: PriceCardsSlide & DrawnSlide }) {
  // All cards in a row match: icons on every card, or on none (a mixed row draws none).
  const icons = cardIconsShow(s.cards);
  return (
    <section style={section(C.bg, { gap: u(40) })}>
      <Header eyebrow={s.eyebrow} title={s.title} subtitle={s.subtitle} />
      <div style={{ display: "flex", gap: u(24) }}>
        {s.cards.map((c, i) => (
          <div key={i} style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: u(20), background: C.card, borderRadius: u(32), padding: u(40) }}>
            {icons ? <LineIcon icon={c.icon} /> : null}
            <p style={{ fontFamily: MONO, fontSize: u(96), fontWeight: 700, lineHeight: 1, letterSpacing: u(-3), whiteSpace: "nowrap", ...(c.highlight ? gradText : { color: C.text }) }}>{c.number}</p>
            {c.label ? <p style={{ fontSize: u(36), fontWeight: 700, color: C.text2 }}>{c.label}</p> : null}
          </div>
        ))}
      </div>
      {s.strip ? (
        <div style={{ display: "flex", alignItems: "center", gap: u(28), background: C.card, borderRadius: u(32), padding: `${u(24)} ${u(40)}` }}>
          <LineIcon icon={s.strip_icon} />
          <p style={{ fontSize: u(36), fontWeight: 700, lineHeight: 1.4, color: C.text }}>{s.strip}</p>
        </div>
      ) : null}
      <Footer slide={s} />
    </section>
  );
}

function StepChain({ s }: { s: StepChainSlide & DrawnSlide }) {
  const n = s.steps.length;
  return (
    <section style={section(C.bg, { gap: u(40) })}>
      <Header eyebrow={s.eyebrow} title={s.title} subtitle={s.subtitle} />
      <div style={{ position: "relative", display: "flex", flexDirection: "column", background: C.card, borderRadius: u(32), padding: `${u(16)} ${u(40)}` }}>
        {n > 1 ? <div style={{ position: "absolute", left: u(70), top: u(56), width: u(4), height: u(79 * (n - 1) - 1), background: C.rail, borderRadius: u(2) }} /> : null}
        {s.steps.map((step, i) => (
          <div key={i} style={{ position: "relative", display: "flex", alignItems: "center", gap: u(24), padding: `${u(6)} 0` }}>
            <Badge n={i + 1} gray={step.last_resort} />
            <ListAvatar who={step.person} />
            <p style={{ fontSize: u(56), fontWeight: 800, lineHeight: 1.2, color: C.text, whiteSpace: "nowrap" }}>{step.name}</p>
            {step.note ? <p style={{ fontSize: u(36), fontWeight: 600, lineHeight: 1.4, color: C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{step.note}</p> : null}
          </div>
        ))}
      </div>
      <Footer slide={s} />
    </section>
  );
}

function Script({ s }: { s: ScriptSlide & DrawnSlide }) {
  return (
    <section style={section(C.bg, { gap: u(40) })}>
      <Header eyebrow={s.eyebrow} title={s.title} subtitle={s.subtitle} />
      <div style={{ display: "flex", flexDirection: "column", gap: u(10) }}>
        {s.rows.map((row, i) =>
          row.who === "rep" ? (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: u(24), padding: `${u(8)} ${u(16)}` }}>
              <SpeakerIcon who="rep" />
              <p style={{ fontSize: u(36), fontWeight: 600, lineHeight: 1.4, color: C.text, padding: `${u(3)} 0 0 0` }}>
                “{row.text}”{row.aside ? <span style={{ color: C.quiet }}> ({row.aside})</span> : null}
              </p>
            </div>
          ) : (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: u(24), padding: `${u(8)} ${u(16)}`, background: C.card, borderRadius: u(20) }}>
              <SpeakerIcon who="client" />
              <p style={{ fontSize: u(36), fontWeight: 500, fontStyle: "italic", lineHeight: 1.4, color: C.muted, padding: `${u(3)} 0 0 0` }}>
                {row.text}
                {row.aside ? <span style={{ color: C.quiet }}> ({row.aside})</span> : null}
              </p>
            </div>
          ),
        )}
      </div>
      <Footer slide={s} />
    </section>
  );
}

function Quote({ s }: { s: QuoteSlide & DrawnSlide }) {
  return (
    <section style={section(C.red, { gap: u(40) })}>
      <Eyebrow red>{s.eyebrow ?? "From me"}</Eyebrow>
      <Spacer />
      <svg viewBox="0 0 150 110" aria-hidden style={{ width: u(150), height: u(110), display: "block", flex: "none" }}>
        <path fill={C.onRed2} opacity="0.7" d="M50 6C22 18 4 42 4 72c0 21 13 34 31 34 16 0 28-12 28-27 0-15-11-26-26-26-3 0-6 0-9 1 4-16 15-28 30-36z" />
        <path fill={C.onRed2} opacity="0.7" d="M128 6C100 18 82 42 82 72c0 21 13 34 31 34 16 0 28-12 28-27 0-15-11-26-26-26-3 0-6 0-9 1 4-16 15-28 30-36z" />
      </svg>
      <h1 style={{ width: u(1500), fontSize: u(96), fontWeight: 800, lineHeight: 1.1, letterSpacing: u(-3), color: C.onRed }}>{s.quote}</h1>
      <p style={{ fontSize: u(36), fontWeight: 700, color: C.onRed2 }}>{s.name}</p>
      <Footer slide={s} red />
    </section>
  );
}

/** The slide itself, filling its canvas. */
export function SlideView({ slide, uid }: { slide: DrawnSlide; uid: string }) {
  switch (slide.layout) {
    case "cover":
      return <Cover s={slide} />;
    case "scoreboard":
      return <Scoreboard s={slide} />;
    case "agenda":
      return <Agenda s={slide} />;
    case "big_news":
      return <BigNews s={slide} />;
    case "big_number":
      return <BigNumber s={slide} />;
    case "chart":
      return <Chart s={slide} uid={uid} />;
    case "key_line":
      return <KeyLine s={slide} />;
    case "diagram":
      return <Diagram s={slide} />;
    case "price_cards":
      return <PriceCards s={slide} />;
    case "step_chain":
      return <StepChain s={slide} />;
    case "script":
      return <Script s={slide} />;
    case "quote":
      return <Quote s={slide} />;
  }
}

/**
 * A slide in a 16:9 box as wide as its parent. `className` sizes and rounds the box (a phone
 * thumbnail gets rounded corners, the TV none).
 */
export function SlideBox({ slide, uid, className, style, label }: { slide: DrawnSlide; uid: string; className?: string; style?: CSSProperties; label?: string }) {
  return (
    <div className={`slide-box ${className ?? ""}`} style={{ background: C.bg, ...style }} role="img" aria-label={label ?? "Slide"}>
      <div className="slide-canvas">
        <SlideView slide={slide} uid={uid} />
      </div>
    </div>
  );
}
