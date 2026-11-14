import type { ContentSlide } from "./slides";
import type { CardSnapshot } from "./types";

/**
 * Pure checks shared by the server code and the tests (no server-only imports): the numbers a
 * draft shows that the owner never said, the lines he said in quote marks, and reading the
 * Command Center connector address he pastes in Settings.
 */

export const DEFAULT_CC_URL = "https://tkg-command-center.vercel.app/api/mcp";

export function cardText(card: CardSnapshot): string {
  return [card.title, card.summary, ...card.points].join("\n");
}

/** Numbers on the slides that the card never says (rule 3). The editor shows them as a warning. */
export function numbersNotInCard(slides: ContentSlide[], card: CardSnapshot): string[] {
  const norm = (s: string) => s.replace(/,/g, "").toLowerCase();
  const source = norm(cardText(card));
  const found = new Set<string>();
  // Only the words the room sees: strings, never the notes or a chart's drawn slice sizes.
  const strings = (v: unknown): string[] =>
    typeof v === "string" ? [v] : Array.isArray(v) ? v.flatMap(strings) : v && typeof v === "object" ? Object.values(v).flatMap(strings) : [];
  for (const s of slides) {
    const text = strings({ ...s, notes: "", layout: "" }).join(" ");
    for (const m of text.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
      const n = norm(m[0]);
      if (n.length === 0) continue;
      // A slide may write $60,000 as $60k: either form in the card counts.
      const k = Number(n) >= 1000 && Number(n) % 1000 === 0 ? `${Number(n) / 1000}k` : "";
      const fromK = /^\d+$/.test(n) && source.includes(`${n}k`);
      const asThousands = new RegExp(`(^|[^\\d])${n}000(?!\\d)`).test(source) || new RegExp(`(^|[^\\d])${n},000`).test(cardText(card));
      if (source.includes(n) || (k && source.includes(k)) || fromK || asThousands) continue;
      found.add(m[0]);
    }
  }
  return [...found].slice(0, 6);
}

/** Lines the card shows in quote marks, so a "quote" the AI offers is really his. */
export function quotedLines(card: CardSnapshot): string[] {
  const out: string[] = [];
  for (const m of cardText(card).matchAll(/[“"]([^“”"]{8,200})[”"]/g)) out.push(m[1].trim());
  return out;
}

/**
 * What the owner pasted for Command Center: the connector's full address with "?token=..." (as
 * claude.ai shows it), or just the token. Returns the address (without the token) and the token.
 */
export function parseConnector(input: string): { url: string; token: string } | null {
  const text = input.trim();
  if (!text) return null;
  if (/^https:\/\//i.test(text)) {
    try {
      const u = new URL(text);
      const token = u.searchParams.get("token") ?? "";
      u.searchParams.delete("token");
      u.hash = "";
      if (!token || token.length < 16) return null;
      if (!u.pathname || u.pathname === "/") u.pathname = "/api/mcp";
      return { url: u.toString(), token };
    } catch {
      return null;
    }
  }
  if (/^[A-Za-z0-9._~+/=-]{16,400}$/.test(text)) return { url: DEFAULT_CC_URL, token: text };
  return null;
}

