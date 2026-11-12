import type { Track } from "./types";
import { api, type ListeningEventInput, type ProviderId } from "./api";

/**
 * Fan Signals from the player: searches, plays (with how much was actually heard), repeats and saves.
 *
 * Fire-and-forget: a failure never affects playback. The backend drops every event unless the listener turned on
 * "Record fan signals" (Settings or Your Fandom), and raw events never leave the device; only per-artist summaries
 * can be shared, separately and only when the listener chooses to (see server/src/listening.ts).
 */

/** Every track in this build comes from the experimental YouTube path; licensed providers will set their own. */
export const providerOf = (_track: Track): ProviderId => "youtube-experimental";

/** Local hint so the player doesn't even send events when recording is known to be off. Null until loaded. */
let recordingHint: boolean | null = null;
export const setRecordingHint = (on: boolean | null) => {
  recordingHint = on;
};

function send(e: ListeningEventInput) {
  if (recordingHint === false) return;
  api.recordListening(e).catch(() => {});
}

const base = (track: Track) => ({ provider: providerOf(track), trackId: track.id, artist: track.artist, artistId: null });

let lastQuery = "";
let pendingSearch: ReturnType<typeof setTimeout> | null = null;
/**
 * A search the listener ran. Search runs as you type, so only the query the listener settled on (no newer one for
 * 2 seconds) is recorded, once.
 */
export function recordSearch(query: string) {
  const q = query.trim().slice(0, 120);
  if (pendingSearch) clearTimeout(pendingSearch);
  if (q.length < 2) return;
  pendingSearch = setTimeout(() => {
    pendingSearch = null;
    if (q.toLowerCase() === lastQuery) return;
    lastQuery = q.toLowerCase();
    send({ type: "search", provider: "youtube-experimental", query: q });
  }, 2000);
}

export function recordLike(track: Track, liked: boolean) {
  send({ type: liked ? "like" : "unlike", ...base(track) });
}

/**
 * One listen of one track: started when audio actually plays, finished when the track ends, is skipped or replaced.
 * Heard time is summed from position updates, so seeking forward doesn't count as listening.
 */
interface Session {
  track: Track;
  listened: number;
  lastPos: number | null;
  duration: number;
}

let session: Session | null = null;

/** Largest gap between two position updates still counted as continuous listening (timeupdate fires every ~250 ms). */
const MAX_TICK = 2.5;

function finish() {
  const s = session;
  session = null;
  if (!s) return;
  const durationSec = Math.max(0, Math.round(s.duration || s.track.duration || 0));
  const listenedSec = Math.round(s.listened);
  if (listenedSec <= 0 && durationSec <= 0) return;
  const completion = durationSec ? Math.min(1, s.listened / durationSec) : 0;
  send({ type: "play_finished", ...base(s.track), listenedSec, durationSec, completion: Math.round(completion * 100) / 100 });
}

/**
 * Audio started for `track`. A reload of the same track mid-listen (switching to video, a retried stream) continues
 * the same session; `fresh` (playback from the start) or another track finishes the previous one first.
 */
export function listenStart(track: Track, opts: { fresh: boolean; repeat?: boolean }) {
  if (session && session.track.id === track.id && !opts.fresh) return;
  finish();
  session = { track, listened: 0, lastPos: null, duration: track.duration };
  send({ type: "play_started", ...base(track), ...(opts.repeat ? { repeat: true } : {}) });
}

export function listenTick(position: number, duration: number) {
  const s = session;
  if (!s) return;
  if (Number.isFinite(duration) && duration > 0) s.duration = duration;
  if (s.lastPos !== null) {
    const delta = position - s.lastPos;
    if (delta > 0 && delta <= MAX_TICK) s.listened += delta;
  }
  s.lastPos = position;
}

/** Position jumped (seek): don't count the jump as listening. */
export function listenSeeked(position: number) {
  if (session) session.lastPos = position;
}

/** Track ended, was skipped, or the app is closing. */
export function listenEnd() {
  finish();
}

/** Repeat-one: the same track starts over without a reload, so close this listen and open the next one. */
export function listenRepeat(track: Track) {
  finish();
  listenStart(track, { fresh: true, repeat: true });
}

if (typeof window !== "undefined") window.addEventListener("pagehide", () => finish());
