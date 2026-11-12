/**
 * Fan Signals storage: the local listening log, the listener's consent, and the GenuineFan link.
 *
 * - Stored next to the library (data/listening.json on the server and desktop app; app storage on the phone).
 * - OPT-IN: nothing is recorded until the listener turns on "Record fan signals" (consent.recording).
 * - Data minimization: event type, provider, track ID, artist, timestamp, how much was heard; search text stays here
 *   and is never part of a sync payload. No titles, IP addresses or account identifiers.
 * - Sync is a separate opt-in (consent.sharing) that also needs a linked GenuineFan account. Only per-artist
 *   aggregates are sent (fanSignals.ts buildPayload), signed with this device's key (fanLink.ts).
 *
 * No Node-only imports here: the Android/iOS build runs this same module with its own storage, like library.ts.
 * See docs/genuinefan-integration.md.
 */
import { buildPayload, computeFandom, type FandomReport, type FanSignalsPayload, type SignalEventType } from "./fanSignals.js";
import { generateDeviceKeys, linkUrl, signPayload, type DeviceKeys } from "./fanLink.js";
import type { LibraryStorage } from "./library.js";
import { msg } from "./i18n.js";
import { HttpError, VIDEO_ID } from "./types.js";

export type ListeningEventType = Exclude<SignalEventType, "play_completed">;
const EVENT_TYPES: readonly ListeningEventType[] = ["search", "play_started", "play_finished", "like", "unlike"];

const PROVIDERS = ["youtube-experimental", "spotify", "apple-music"] as const;
export type ListeningProvider = (typeof PROVIDERS)[number];

export interface ListeningEvent {
  id: string;
  /** "play_completed" only appears in logs written by the first experiment builds. */
  type: ListeningEventType | "play_completed";
  provider: ListeningProvider;
  /** The provider's own track ID (a YouTube video ID for youtube-experimental). Empty for searches. */
  trackId: string;
  /** Artist credit as shown in the catalog. Empty for searches. */
  artist: string;
  /** The provider's artist ID when the catalog gave one (future: mapped to a GenuineFan artist). */
  artistId: string | null;
  /** Unix time in milliseconds, set when the event is recorded. */
  at: number;
  query?: string;
  listenedSec?: number;
  durationSec?: number;
  completion?: number;
  repeat?: boolean;
}

export interface FanConsent {
  /** Record listening events on this device. Off until the listener turns it on. */
  recording: boolean;
  /** Send per-artist summaries to the linked GenuineFan account. */
  sharing: boolean;
  updatedAt: number | null;
}

export type LinkStatus = "none" | "pending" | "linked";

export interface FanLink {
  status: LinkStatus;
  startedAt: number | null;
  linkedAt: number | null;
  /** What GenuineFan said about the account (display name or handle), once linked. */
  account: string | null;
}

export interface SyncResult {
  at: number;
  ok: boolean;
  artists: number;
  message: string;
}

export interface ListeningLog {
  version: 2;
  events: ListeningEvent[];
  consent: FanConsent;
  device: DeviceKeys | null;
  link: FanLink;
  lastSync: SyncResult | null;
}

/** Oldest events are dropped beyond this, so the file stays small. */
const EVENT_LIMIT = 10_000;

const NO_LINK: FanLink = { status: "none", startedAt: null, linkedAt: null, account: null };

let storage: LibraryStorage | null = null;
let allowed = true;
let state: ListeningLog | null = null;
let writeChain: Promise<void> = Promise.resolve();

/**
 * Set once at startup. `record: false` is an operator kill switch (GENUINEFAN_RECORD_LISTENING=0): events are
 * dropped whatever the listener chose.
 */
export function useListeningStorage(s: LibraryStorage, opts: { record?: boolean } = {}) {
  storage = s;
  allowed = opts.record ?? true;
  state = null;
}

/** Recording happens only when the operator allows it AND the listener opted in. */
export const isRecording = async () => allowed && (await load()).consent.recording;
export const recordingAllowed = () => allowed;

/** Reads the file, upgrading a version 1 log (events only, recorded before consent existed: kept, recording off). */
async function load(): Promise<ListeningLog> {
  if (state) return state;
  if (!storage) throw new Error("Listening storage not configured");
  const json = await storage.read();
  let parsed: Partial<ListeningLog> & { version?: number } = {};
  try {
    parsed = json ? (JSON.parse(json) as Partial<ListeningLog>) : {};
  } catch {
    parsed = {}; // a damaged log is replaced rather than blocking playback
  }
  const c = parsed.consent;
  state = {
    version: 2,
    events: Array.isArray(parsed.events) ? parsed.events : [],
    consent: {
      recording: parsed.version === 2 && c?.recording === true,
      sharing: parsed.version === 2 && c?.sharing === true,
      updatedAt: typeof c?.updatedAt === "number" ? c.updatedAt : null,
    },
    device: parsed.device && typeof parsed.device.deviceId === "string" ? parsed.device : null,
    link: parsed.link && ["none", "pending", "linked"].includes(parsed.link.status) ? { ...NO_LINK, ...parsed.link } : { ...NO_LINK },
    lastSync: parsed.lastSync ?? null,
  };
  if (!state.device) state.link = { ...NO_LINK };
  return state;
}

function persist(): Promise<void> {
  const snapshot = JSON.stringify(state);
  writeChain = writeChain.then(() => storage!.write(snapshot));
  return writeChain;
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const num = (v: unknown, min: number, max: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : undefined;

/** Validates an event sent by the app. The timestamp and ID are always set here, never taken from the client. */
export function sanitizeEvent(input: unknown): Omit<ListeningEvent, "id" | "at"> {
  const e = (input ?? {}) as Record<string, unknown>;
  // Older app builds send "play_completed": read it as a finished play heard to the end.
  const legacy = e.type === "play_completed";
  const type = legacy ? "play_finished" : (EVENT_TYPES as readonly unknown[]).includes(e.type) ? (e.type as ListeningEventType) : null;
  if (!type) throw new HttpError(400, msg("invalidListeningEvent"));
  const provider = (PROVIDERS as readonly unknown[]).includes(e.provider) ? (e.provider as ListeningProvider) : null;
  if (!provider) throw new HttpError(400, msg("invalidListeningEvent"));

  if (type === "search") {
    const query = str(e.query, 120);
    if (!query) throw new HttpError(400, msg("invalidListeningEvent"));
    return { type, provider, trackId: "", artist: "", artistId: null, query };
  }

  const trackId = str(e.trackId, 64);
  if (!trackId || (provider === "youtube-experimental" && !VIDEO_ID.test(trackId))) {
    throw new HttpError(400, msg("invalidListeningEvent"));
  }
  const artistId = str(e.artistId, 64);
  const out: Omit<ListeningEvent, "id" | "at"> = { type, provider, trackId, artist: str(e.artist, 200), artistId: artistId || null };
  if (type === "play_finished") {
    const durationSec = num(e.durationSec, 0, 6 * 3600);
    // Can't have heard more than the track (plus a little slack for rounding).
    const listenedSec = legacy ? durationSec : num(e.listenedSec, 0, durationSec ? durationSec + 5 : 6 * 3600);
    out.durationSec = durationSec;
    out.listenedSec = listenedSec ?? 0;
    out.completion = legacy ? 1 : num(e.completion, 0, 1) ?? (durationSec ? Math.min(1, (listenedSec ?? 0) / durationSec) : 0);
  }
  if (type === "play_started" && e.repeat === true) out.repeat = true;
  return out;
}

export async function recordListening(input: unknown): Promise<ListeningEvent | null> {
  const clean = sanitizeEvent(input);
  if (!(await isRecording())) return null;
  const log = await load();
  const event: ListeningEvent = { id: globalThis.crypto.randomUUID(), ...clean, at: Date.now() };
  log.events.push(event);
  if (log.events.length > EVENT_LIMIT) log.events.splice(0, log.events.length - EVENT_LIMIT);
  await persist();
  return event;
}

/** Newest first. */
export async function listListening(limit = 200): Promise<ListeningEvent[]> {
  const log = await load();
  return log.events.slice(-Math.max(1, Math.min(limit, EVENT_LIMIT))).reverse();
}

/** The listener's "clear listening history" control. Consent and the GenuineFan link are kept. */
export async function clearListening(): Promise<void> {
  const log = await load();
  log.events = [];
  log.lastSync = null;
  await persist();
}

// ---- Fan Signals ----

export interface FanSyncOptions {
  /** GenuineFan web app, where the link page lives (https://genuinefan.vip). */
  appUrl: string;
  /** HTTPS endpoint that accepts signed payloads (GenuineFan Cloud Function). Null until GenuineFan ships it. */
  endpoint: string | null;
  version: string;
  platform: string;
  /** Shown on GenuineFan's device list ("GenuineFan Player on macOS"). */
  deviceLabel: string;
  fetch?: typeof fetch;
}

export interface FanSignalsState {
  allowed: boolean;
  consent: FanConsent;
  link: FanLink & { deviceId: string | null };
  sync: { endpointConfigured: boolean; lastSync: SyncResult | null };
  events: number;
  report: FandomReport;
}

const tzOf = (tz: unknown) => (typeof tz === "number" && Number.isFinite(tz) && Math.abs(tz) <= 14 * 60 ? Math.round(tz) : 0);

export async function getFanSignals(opts: { tzOffsetMinutes?: number; endpointConfigured: boolean }): Promise<FanSignalsState> {
  const log = await load();
  return {
    allowed,
    consent: log.consent,
    link: { ...log.link, deviceId: log.device?.deviceId ?? null },
    sync: { endpointConfigured: opts.endpointConfigured, lastSync: log.lastSync },
    events: log.events.length,
    report: computeFandom(log.events, { tzOffsetMinutes: tzOf(opts.tzOffsetMinutes) }),
  };
}

export async function setConsent(input: unknown): Promise<FanConsent> {
  const v = (input ?? {}) as Record<string, unknown>;
  const log = await load();
  if (typeof v.recording === "boolean") log.consent.recording = v.recording;
  if (typeof v.sharing === "boolean") log.consent.sharing = v.sharing;
  // Sharing needs recording and a link; turning recording off turns sharing off too.
  if (!log.consent.recording || log.link.status === "none") log.consent.sharing = false;
  log.consent.updatedAt = Date.now();
  await persist();
  return log.consent;
}

/** Creates this device's key pair (once) and returns the GenuineFan page where the fan approves it. */
export async function startLink(opts: Pick<FanSyncOptions, "appUrl" | "deviceLabel">): Promise<{ url: string; deviceId: string }> {
  const log = await load();
  log.device ??= await generateDeviceKeys();
  if (log.link.status !== "linked") log.link = { ...NO_LINK, status: "pending", startedAt: Date.now() };
  await persist();
  return { url: linkUrl(opts.appUrl, log.device, opts.deviceLabel), deviceId: log.device.deviceId };
}

/** Forgets the link and the key pair (a new link makes a new device). GenuineFan should also revoke it on its side. */
export async function unlink(): Promise<void> {
  const log = await load();
  log.device = null;
  log.link = { ...NO_LINK };
  log.consent.sharing = false;
  log.lastSync = null;
  await persist();
}

/** Exactly what a sync would send right now (unsigned), so the listener can see it before agreeing. */
export async function previewPayload(opts: Pick<FanSyncOptions, "version" | "platform"> & { tzOffsetMinutes?: number }): Promise<FanSignalsPayload> {
  const log = await load();
  const tzOffsetMinutes = tzOf(opts.tzOffsetMinutes);
  return buildPayload(computeFandom(log.events, { tzOffsetMinutes }), {
    deviceId: log.device?.deviceId ?? "not-linked",
    nonce: "preview",
    version: opts.version,
    platform: opts.platform,
    tzOffsetMinutes,
  });
}

/**
 * Signs and sends the per-artist summary. GenuineFan answers 200 with `{ linked: true, account }` once the fan has
 * approved this device, or 404/403 while it hasn't (the link stays pending).
 */
export async function syncNow(opts: FanSyncOptions & { tzOffsetMinutes?: number }): Promise<SyncResult> {
  const log = await load();
  if (!allowed || !log.consent.recording || !log.consent.sharing) throw new HttpError(409, msg("fanSyncNotAllowed"));
  if (!log.device || log.link.status === "none") throw new HttpError(409, msg("fanSyncNotLinked"));
  if (!opts.endpoint) throw new HttpError(412, msg("fanSyncNoEndpoint"));

  const tzOffsetMinutes = tzOf(opts.tzOffsetMinutes);
  const payload = buildPayload(computeFandom(log.events, { tzOffsetMinutes }), {
    deviceId: log.device.deviceId,
    nonce: globalThis.crypto.randomUUID(),
    version: opts.version,
    platform: opts.platform,
    tzOffsetMinutes,
  });
  const envelope = await signPayload(log.device, payload);
  const doFetch = opts.fetch ?? globalThis.fetch;
  let result: SyncResult;
  try {
    const res = await doFetch(opts.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(envelope),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await res.json().catch(() => ({}))) as { linked?: boolean; account?: string; error?: string; accepted?: number };
    if (res.ok) {
      if (body.linked !== false) {
        log.link = { ...log.link, status: "linked", linkedAt: log.link.linkedAt ?? Date.now(), account: str(body.account, 80) || log.link.account };
      }
      result = { at: Date.now(), ok: true, artists: payload.artists.length, message: "ok" };
    } else {
      if (res.status === 401 || res.status === 403 || res.status === 404) log.link = { ...log.link, status: "pending" };
      result = { at: Date.now(), ok: false, artists: 0, message: str(body.error, 200) || `HTTP ${res.status}` };
    }
  } catch (e) {
    result = { at: Date.now(), ok: false, artists: 0, message: str((e as Error).message, 200) || "network error" };
  }
  log.lastSync = result;
  await persist();
  return result;
}
