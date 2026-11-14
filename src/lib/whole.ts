import "server-only";
import { after } from "next/server";
import { cachePocket, decidePocket, deleteItems, ensureOpenMeeting, getMeeting, insertItems, listItems, switchOffArrivals, switchOffOthers, TRANSCRIPT_MAX } from "./data";
import { draftPending, planWholeMeeting } from "./draft";
import { newItem, refreshLiveDeck } from "./meeting";
import { fetchRecording, PocketError } from "./pocket";
import { cut, isLength, isRecordingId, recordingOfCard, wholeCardId, type Length } from "./pocket-shape";
import { RUN_CLOCK } from "./checks";
import type { CardSnapshot, Item } from "./types";

/**
 * A whole meeting from one Pocket recording (owner, 2026-11-14: "sometimes one recording is a
 * meeting in and of itself"). Claude splits the recording into parts at the length he picked
 * (Brief, Standard, Full) and what he asked; each part becomes a thought "pocket:<id>#n" of the
 * next meeting, drafted like any other with its planned number of slides. Made the first time,
 * the meeting's other thoughts are switched off by the app (they come back on at the next
 * meeting). Made again (a new length or ask), its parts are replaced and the rest stays as it is.
 */

/** The parts of a recording's whole meeting in a meeting, in order. */
export function partsOf(items: Item[], rec: string): Item[] {
  return items.filter((i) => recordingOfCard(i.card_id) === rec).sort((a, b) => a.position - b.position);
}

export async function makeWholeMeeting(
  recordingId: string,
  lengthIn: string,
  askIn: string,
  opts: { startedAt: number; redo?: boolean },
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const rec = recordingId;
  if (!isRecordingId(rec)) return { ok: false, error: "That recording isn't there." };
  const length: Length = isLength(lengthIn) ? lengthIn : "standard";
  const ask = askIn.replace(/\s+/g, " ").trim().slice(0, 300);

  const first = await ensureOpenMeeting();
  if (first.status === "live") return { ok: false, error: "The show is on the TV: pause it first, then make the meeting." };
  const before = partsOf(await listItems(first.id), rec);

  // What he said: from the parts already made (no need to ask Pocket again), else from Pocket.
  let source: { title: string; summary: string; transcript: string; said_at: string | null } | null = null;
  const kept = before.find((i) => i.card.transcript);
  if (kept) source = { title: kept.card.whole?.label || kept.card.title, summary: before.find((i) => !i.card.whole)?.card.summary ?? "", transcript: kept.card.transcript ?? "", said_at: kept.card.said_at };
  if (!source) {
    try {
      const r = await fetchRecording(rec);
      await cachePocket([{ recording_id: rec, title: r.title, summary: r.summary, recorded_at: r.recordedAt, duration_sec: r.durationSec }]);
      source = { title: r.title, summary: r.summary, transcript: r.transcript, said_at: r.recordedAt };
    } catch (err) {
      return { ok: false, error: err instanceof PocketError ? err.message : "Pocket didn't answer. Try again in a moment." };
    }
  }
  if (!source.transcript && !source.summary) return { ok: false, error: "Pocket hasn't finished this recording yet. Try again in a minute." };
  const transcript = cut(source.transcript, TRANSCRIPT_MAX);
  const label = cut(source.title || "A Pocket recording", 200);

  // The plan gets most of the run; the drafts that follow run in after() on the clock that's left,
  // and the meeting's page picks up any that don't fit.
  const plan = await planWholeMeeting({ title: label, summary: source.summary, transcript }, length, ask, opts.startedAt + RUN_CLOCK.callMs);
  if (!plan.ok) return { ok: false, error: plan.message };

  // Read the meeting again: the plan takes a while, and End or Play may have landed meanwhile.
  let meeting = await getMeeting(first.id);
  if (!meeting || meeting.status === "done") meeting = await ensureOpenMeeting();
  if (meeting.status === "live") return { ok: false, error: "The show went on the TV meanwhile: pause it first, then make the meeting." };
  const items = await listItems(meeting.id);
  const old = partsOf(items, rec);
  const others = items.filter((i) => !old.includes(i));
  const ccId = old.find((i) => i.card.cc_id)?.card.cc_id;
  const of = plan.parts.length;
  // The parts lead the meeting: before everything else, or where the old parts were.
  const base = old.length ? old[0].position : (others.length ? Math.min(...others.map((i) => i.position)) : 1) - of;
  const midShow = meeting.started_at != null;
  const cards = plan.parts.map((p, i): { id: string; card: CardSnapshot } => ({
    id: wholeCardId(rec, i + 1),
    card: {
      title: cut(p.title, 200),
      summary: cut(p.summary, 2000),
      points: p.points.map((x) => cut(x, 400)),
      people: [],
      said_at: source.said_at,
      open: true,
      ...(transcript ? { transcript } : {}),
      ...(i === 0 && ccId ? { cc_id: ccId } : {}),
      whole: { rec, n: i + 1, of, length, slides: p.slides, ...(ask ? { ask } : {}), label },
    },
  }));
  await deleteItems(meeting.id, old.map((i) => i.id));
  await insertItems(cards.map((c, i) => newItem(meeting.id, c, base + i, midShow)));
  if (!midShow && (await getMeeting(meeting.id))?.started_at) await switchOffArrivals(meeting.id, cards.map((c) => c.id));
  if (!opts.redo && !old.length) await switchOffOthers(meeting.id, cards.map((c) => c.id));
  const made = partsOf(await listItems(meeting.id), rec);
  await decidePocket(rec, "meeting", made[0]?.id ?? null);
  const target = meeting.id;
  after(() =>
    draftPending(target, { startedAt: opts.startedAt })
      .then(() => refreshLiveDeck(target))
      .catch(() => undefined),
  );
  const slides = plan.parts.reduce((n, p) => n + p.slides, 0);
  return { ok: true, message: `${of} topics, ${slides} slides. Claude is making them now.` };
}
