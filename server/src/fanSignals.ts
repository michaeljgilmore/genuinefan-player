/**
 * Fan Signals: turns the local listening log into per-artist fandom scores, and builds the per-artist summary a
 * listener can choose to share with GenuineFan. Pure functions, no I/O and no Node-only imports (the Android/iOS
 * build runs this module in the app). See docs/genuinefan-integration.md for the scoring model and the sync contract.
 */

export type SignalProvider = "youtube-experimental" | "spotify" | "apple-music";

export type SignalEventType =
  | "search"
  | "play_started"
  | "play_finished"
  /** Written by the first GenuineFan Player builds; read as a finished play with 100% completion. */
  | "play_completed"
  | "like"
  | "unlike";

/** What the scorer reads from a listening event (server/src/listening.ts stores a superset). */
export interface SignalEvent {
  type: SignalEventType;
  provider: SignalProvider;
  trackId?: string;
  artist?: string;
  artistId?: string | null;
  /** Unix ms. */
  at: number;
  /** Search text (local only, never part of a sync payload). */
  query?: string;
  /** Seconds actually heard (seeks excluded). */
  listenedSec?: number;
  durationSec?: number;
  /** 0..1 share of the track heard. */
  completion?: number;
  /** Started again right after itself (repeat-one or replay). */
  repeat?: boolean;
}

/**
 * Licensed providers play through the listener's own subscription, so the service itself vouches for the play.
 * The experimental YouTube path is unverifiable (and against YouTube's terms), so it counts at a quarter weight
 * and is always reported separately as "unverified".
 */
export const VERIFIED_PROVIDERS: ReadonlySet<SignalProvider> = new Set(["spotify", "apple-music"]);
export const UNVERIFIED_WEIGHT = 0.25;
export const isVerifiedProvider = (p: SignalProvider) => VERIFIED_PROVIDERS.has(p);

export const SCORING_VERSION = 1;
export const DEFAULT_WINDOW_DAYS = 90;

/** A play counts once the listener heard 30 s or half the track; it is "completed" from 90%. */
export const QUALIFIED_MIN_SEC = 30;
export const QUALIFIED_MIN_COMPLETION = 0.5;
export const COMPLETED_MIN = 0.9;
/** A replay of the same track within this gap counts as a repeat. */
const REPEAT_GAP_MS = 30 * 60_000;
/** More than this much listening to one artist in one day isn't a person. */
const IMPLAUSIBLE_DAILY_SEC = 14 * 3600;

/** Points per component; they add up to 100. Thresholds are where a component maxes out. */
export const COMPONENTS = {
  plays: { max: 20, saturate: 40 },
  completion: { max: 20, saturate: 30 },
  depth: { max: 15, saturate: 12 },
  consistency: { max: 15, saturate: 20 },
  streak: { max: 10, saturate: 7 },
  repeats: { max: 5, saturate: 6 },
  saves: { max: 10, saturate: 4 },
  searches: { max: 5, saturate: 4 },
} as const;
export type ComponentId = keyof typeof COMPONENTS;

/** Same cut-offs as GenuineFan's fan status (FAN_TIER_MIN_SCORE 25, GENUINE_FAN_MIN_SCORE 70), plus VIP. */
export const TIERS = { fan: 25, genuine: 70, vip: 85 } as const;
export type FandomTier = "listener" | "fan" | "genuine" | "vip";

export type FandomBadge =
  | "verified_listener"
  | "deep_cuts"
  | "on_repeat"
  | "streak_7"
  | "streak_30"
  | "completionist"
  | "collector"
  | "seeker"
  | "long_haul";

export type FandomFlag =
  /** Some plays came from the experimental YouTube path (weighted at 25%, never verified). */
  | "unverified_plays"
  /** More than 14 hours of one artist in a day: score halved. */
  | "implausible_volume"
  /** Mostly one track on loop: score ×0.7. */
  | "loop_pattern"
  /** Most listening crammed into a single day: score ×0.8. */
  | "burst";

const PENALTIES: Partial<Record<FandomFlag, number>> = { implausible_volume: 0.5, loop_pattern: 0.7, burst: 0.8 };

export interface ArtistCounts {
  /** Plays started. */
  plays: number;
  /** Plays heard for 30 s or half the track. */
  qualifiedPlays: number;
  /** Plays heard to 90% or more. */
  completedPlays: number;
  listenedSec: number;
  /** Different tracks with a qualified play. */
  distinctTracks: number;
  /** Days with a qualified play. */
  activeDays: number;
  /** Consecutive days with a qualified play, ending today or yesterday. */
  streakDays: number;
  repeats: number;
  /** Tracks currently in Favorites. */
  saves: number;
}

export interface ArtistFandom {
  /** Normalized primary-artist name: the join key until GenuineFan maps provider artist IDs. */
  artistKey: string;
  artistName: string;
  providerArtistIds: Partial<Record<SignalProvider, string>>;
  verified: ArtistCounts;
  unverified: ArtistCounts;
  searches: number;
  /** YYYY-MM-DD in the listener's time zone. */
  firstSeenDay: string | null;
  lastSeenDay: string | null;
  /** Average share of the track heard over finished plays (0..1). */
  avgCompletion: number;
  /** Share of qualified plays from verified providers (0..1). */
  verifiedShare: number;
  breakdown: Record<ComponentId, number>;
  score: number;
  tier: FandomTier;
  badges: FandomBadge[];
  flags: FandomFlag[];
}

export interface FandomSummary {
  artists: number;
  listenedSec: number;
  qualifiedPlays: number;
  searches: number;
  /** Days in a row with any qualified play, ending today or yesterday. */
  streakDays: number;
  /** Whether any verified (licensed-provider) play exists. */
  hasVerified: boolean;
}

export interface FandomReport {
  scoringVersion: number;
  windowDays: number;
  generatedAt: number;
  summary: FandomSummary;
  /** Highest score first. */
  artists: ArtistFandom[];
}

export interface FandomOptions {
  now?: number;
  windowDays?: number;
  /** Minutes east of UTC (e.g. -480 for Los Angeles in winter). Days and streaks are counted in this zone. */
  tzOffsetMinutes?: number;
}

/** Lowercase, accents stripped, punctuation to spaces. Mirrors genuine-fan's artist-name matching. */
export function normalizeName(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** The primary artist of a credit like "A, B & C feat. D" or "A x B". */
export function primaryArtist(credit: unknown): string {
  const raw = String(credit ?? "").trim();
  const first = raw.split(/\s*(?:,|;|\s&\s|\s+x\s+|\s+feat\.?\s+|\s+ft\.?\s+|\s+featuring\s+|\s+with\s+)\s*/i)[0] ?? "";
  return first.trim();
}

export function dayKey(at: number, tzOffsetMinutes = 0): string {
  return new Date(at + tzOffsetMinutes * 60_000).toISOString().slice(0, 10);
}

const DAY_MS = 86_400_000;
const dayNumber = (key: string) => Math.round(Date.parse(`${key}T00:00:00Z`) / DAY_MS);

/** Consecutive days ending today or yesterday (so a streak doesn't break before today's first play). */
export function currentStreak(days: Iterable<string>, todayKey: string): number {
  const set = new Set([...days].map(dayNumber));
  const today = dayNumber(todayKey);
  let start = set.has(today) ? today : set.has(today - 1) ? today - 1 : null;
  if (start === null) return 0;
  let n = 0;
  while (set.has(start - n)) n++;
  return n;
}

const isQualified = (listenedSec: number, completion: number) =>
  listenedSec >= QUALIFIED_MIN_SEC || completion >= QUALIFIED_MIN_COMPLETION;

const finite = (v: unknown, fallback = 0) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const logScale = (v: number, saturate: number) => clamp01(Math.log1p(Math.max(0, v)) / Math.log1p(saturate));
const linScale = (v: number, saturate: number) => clamp01(Math.max(0, v) / saturate);
const round1 = (v: number) => Math.round(v * 10) / 10;

interface Side {
  plays: number;
  qualified: number;
  completed: number;
  listenedSec: number;
  tracks: Set<string>;
  days: Set<string>;
  repeats: number;
  liked: Set<string>;
  completionSum: number;
  finished: number;
  dailySec: Map<string, number>;
  dailyQualified: Map<string, number>;
}

const newSide = (): Side => ({
  plays: 0,
  qualified: 0,
  completed: 0,
  listenedSec: 0,
  tracks: new Set(),
  days: new Set(),
  repeats: 0,
  liked: new Set(),
  completionSum: 0,
  finished: 0,
  dailySec: new Map(),
  dailyQualified: new Map(),
});

interface Acc {
  key: string;
  names: Map<string, number>;
  ids: Partial<Record<SignalProvider, string>>;
  verified: Side;
  unverified: Side;
  searches: number;
  first: number;
  last: number;
}

function countsOf(side: Side, todayKey: string): ArtistCounts {
  return {
    plays: side.plays,
    qualifiedPlays: side.qualified,
    completedPlays: side.completed,
    listenedSec: Math.round(side.listenedSec),
    distinctTracks: side.tracks.size,
    activeDays: side.days.size,
    streakDays: currentStreak(side.days, todayKey),
    repeats: side.repeats,
    saves: side.liked.size,
  };
}

/** Verified counts at full weight, unverified at UNVERIFIED_WEIGHT. */
const eff = (v: number, u: number) => v + UNVERIFIED_WEIGHT * u;

export function scoreArtist(
  verified: ArtistCounts,
  unverified: ArtistCounts,
  searches: number,
): { breakdown: Record<ComponentId, number>; raw: number } {
  const C = COMPONENTS;
  const breakdown: Record<ComponentId, number> = {
    plays: C.plays.max * logScale(eff(verified.qualifiedPlays, unverified.qualifiedPlays), C.plays.saturate),
    completion: C.completion.max * logScale(eff(verified.completedPlays, unverified.completedPlays), C.completion.saturate),
    depth: C.depth.max * linScale(eff(verified.distinctTracks, unverified.distinctTracks), C.depth.saturate),
    consistency: C.consistency.max * linScale(eff(verified.activeDays, unverified.activeDays), C.consistency.saturate),
    streak:
      C.streak.max *
      linScale(Math.max(verified.streakDays, UNVERIFIED_WEIGHT * Math.max(verified.streakDays, unverified.streakDays)), C.streak.saturate),
    repeats: C.repeats.max * linScale(eff(verified.repeats, unverified.repeats), C.repeats.saturate),
    saves: C.saves.max * linScale(eff(verified.saves, unverified.saves), C.saves.saturate),
    searches: C.searches.max * linScale(searches, C.searches.saturate),
  };
  for (const k of Object.keys(breakdown) as ComponentId[]) breakdown[k] = round1(breakdown[k]);
  const raw = Object.values(breakdown).reduce((a, b) => a + b, 0);
  return { breakdown, raw };
}

export function tierFor(score: number, verifiedShare: number, flags: readonly FandomFlag[]): FandomTier {
  const penalized = flags.some((f) => PENALTIES[f] !== undefined);
  if (score >= TIERS.vip && verifiedShare >= 0.5 && !penalized) return "vip";
  if (score >= TIERS.genuine) return "genuine";
  if (score >= TIERS.fan) return "fan";
  return "listener";
}

/** Builds every artist's fandom from the log. Events outside the window are ignored, except likes (a saved track stays saved). */
export function computeFandom(events: readonly SignalEvent[], opts: FandomOptions = {}): FandomReport {
  const now = opts.now ?? Date.now();
  const windowDays = opts.windowDays ?? DEFAULT_WINDOW_DAYS;
  const tz = opts.tzOffsetMinutes ?? 0;
  const since = now - windowDays * DAY_MS;
  const todayKey = dayKey(now, tz);

  const sorted = [...events].filter((e) => e && finite(e.at) > 0 && e.at <= now + 60_000).sort((a, b) => a.at - b.at);
  const acc = new Map<string, Acc>();
  const searches: string[] = [];
  const allDays = new Set<string>();
  let lastStart: { trackId: string; at: number } | null = null;

  const get = (credit: string | undefined): Acc | null => {
    const name = primaryArtist(credit);
    const key = normalizeName(name);
    if (!key) return null;
    let a = acc.get(key);
    if (!a) {
      a = { key, names: new Map(), ids: {}, verified: newSide(), unverified: newSide(), searches: 0, first: Infinity, last: 0 };
      acc.set(key, a);
    }
    a.names.set(name, (a.names.get(name) ?? 0) + 1);
    return a;
  };

  for (const e of sorted) {
    if (e.type === "search") {
      if (e.at >= since && e.query) searches.push(normalizeName(e.query));
      continue;
    }
    const a = get(e.artist);
    if (!a) continue;
    const side = isVerifiedProvider(e.provider) ? a.verified : a.unverified;
    if (e.artistId && !a.ids[e.provider]) a.ids[e.provider] = e.artistId;
    const track = e.trackId ? `${e.provider}:${e.trackId}` : "";

    if (e.type === "like" || e.type === "unlike") {
      if (!track) continue;
      if (e.type === "like") side.liked.add(track);
      else side.liked.delete(track);
      continue;
    }
    if (e.at < since) continue;
    a.first = Math.min(a.first, e.at);
    a.last = Math.max(a.last, e.at);

    if (e.type === "play_started") {
      side.plays++;
      const replay = !!lastStart && lastStart.trackId === track && e.at - lastStart.at <= REPEAT_GAP_MS;
      if (e.repeat || replay) side.repeats++;
      lastStart = { trackId: track, at: e.at };
      continue;
    }
    // play_finished / legacy play_completed
    const legacy = e.type === "play_completed";
    const duration = finite(e.durationSec);
    const listened = Math.max(0, finite(e.listenedSec, legacy ? duration : 0));
    const completion = clamp01(legacy ? 1 : finite(e.completion, duration > 0 ? listened / duration : 0));
    side.finished++;
    side.completionSum += completion;
    side.listenedSec += listened;
    const day = dayKey(e.at, tz);
    side.dailySec.set(day, (side.dailySec.get(day) ?? 0) + listened);
    if (!isQualified(listened, completion) && !legacy) continue;
    side.qualified++;
    if (completion >= COMPLETED_MIN) side.completed++;
    if (track) side.tracks.add(track);
    side.days.add(day);
    allDays.add(day);
    side.dailyQualified.set(day, (side.dailyQualified.get(day) ?? 0) + 1);
  }

  for (const q of searches) {
    if (!q) continue;
    const padded = ` ${q} `;
    for (const a of acc.values()) if (a.key.length >= 2 && padded.includes(` ${a.key} `)) a.searches++;
  }

  const artists: ArtistFandom[] = [];
  let listenedSec = 0;
  let qualifiedPlays = 0;
  let hasVerified = false;

  for (const a of acc.values()) {
    const verified = countsOf(a.verified, todayKey);
    const unverified = countsOf(a.unverified, todayKey);
    const totalQualified = verified.qualifiedPlays + unverified.qualifiedPlays;
    if (!totalQualified && !verified.saves && !unverified.saves && !verified.plays && !unverified.plays) continue;

    const verifiedShare = totalQualified ? verified.qualifiedPlays / totalQualified : verified.saves > 0 ? 1 : 0;
    const { breakdown, raw } = scoreArtist(verified, unverified, a.searches);

    const flags: FandomFlag[] = [];
    if (unverified.plays > 0 || unverified.saves > 0) flags.push("unverified_plays");
    const daily = new Map<string, number>();
    for (const s of [a.verified, a.unverified]) for (const [d, sec] of s.dailySec) daily.set(d, (daily.get(d) ?? 0) + sec);
    if ([...daily.values()].some((sec) => sec > IMPLAUSIBLE_DAILY_SEC)) flags.push("implausible_volume");
    const plays = verified.plays + unverified.plays;
    const repeats = verified.repeats + unverified.repeats;
    if (plays >= 20 && repeats > 0.7 * plays) flags.push("loop_pattern");
    const perDay = new Map<string, number>();
    for (const s of [a.verified, a.unverified]) for (const [d, n] of s.dailyQualified) perDay.set(d, (perDay.get(d) ?? 0) + n);
    if (totalQualified >= 15 && Math.max(0, ...perDay.values()) >= 0.8 * totalQualified) flags.push("burst");

    // Unverified listening alone tops out at 40 ("Fan"); verified listening unlocks the rest.
    let score = Math.min(raw, 40 + 60 * verifiedShare);
    for (const f of flags) score *= PENALTIES[f] ?? 1;
    score = Math.round(Math.max(0, Math.min(100, score)));

    const finished = a.verified.finished + a.unverified.finished;
    const avgCompletion = finished ? (a.verified.completionSum + a.unverified.completionSum) / finished : 0;
    const completed = verified.completedPlays + unverified.completedPlays;
    const distinct = verified.distinctTracks + unverified.distinctTracks;
    const streak = Math.max(verified.streakDays, unverified.streakDays);
    const saves = verified.saves + unverified.saves;

    const badges: FandomBadge[] = [];
    if (verified.qualifiedPlays >= 10) badges.push("verified_listener");
    if (distinct >= 10) badges.push("deep_cuts");
    if (repeats >= 5) badges.push("on_repeat");
    if (streak >= 30) badges.push("streak_30");
    else if (streak >= 7) badges.push("streak_7");
    if (completed >= 10 && avgCompletion >= 0.85) badges.push("completionist");
    if (saves >= 5) badges.push("collector");
    if (a.searches >= 5) badges.push("seeker");
    if (a.last - a.first >= 30 * DAY_MS && now - a.last <= 7 * DAY_MS) badges.push("long_haul");

    const artistName = [...a.names.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? a.key;
    artists.push({
      artistKey: a.key,
      artistName,
      providerArtistIds: a.ids,
      verified,
      unverified,
      searches: a.searches,
      firstSeenDay: Number.isFinite(a.first) ? dayKey(a.first, tz) : null,
      lastSeenDay: a.last ? dayKey(a.last, tz) : null,
      avgCompletion: Math.round(avgCompletion * 100) / 100,
      verifiedShare: Math.round(verifiedShare * 100) / 100,
      breakdown,
      score,
      tier: tierFor(score, verifiedShare, flags),
      badges,
      flags,
    });
    listenedSec += verified.listenedSec + unverified.listenedSec;
    qualifiedPlays += totalQualified;
    if (verified.qualifiedPlays > 0) hasVerified = true;
  }

  artists.sort((x, y) => y.score - x.score || y.verified.qualifiedPlays + y.unverified.qualifiedPlays - (x.verified.qualifiedPlays + x.unverified.qualifiedPlays) || x.artistKey.localeCompare(y.artistKey));

  return {
    scoringVersion: SCORING_VERSION,
    windowDays,
    generatedAt: now,
    summary: {
      artists: artists.length,
      listenedSec,
      qualifiedPlays,
      searches: searches.length,
      streakDays: currentStreak(allDays, todayKey),
      hasVerified,
    },
    artists,
  };
}

// ---- Sync payload (what a listener can choose to share with GenuineFan) ----

export const PAYLOAD_SCHEMA = "vip.genuinefan.player.fan-signals/v1";
/** Most artists one payload carries (highest scores first). */
export const PAYLOAD_ARTIST_LIMIT = 50;

export interface PayloadArtist {
  artistKey: string;
  artistName: string;
  providerArtistIds: Partial<Record<SignalProvider, string>>;
  verified: ArtistCounts;
  unverified: ArtistCounts;
  searches: number;
  firstSeenDay: string | null;
  lastSeenDay: string | null;
  avgCompletion: number;
  /** The player's own score and tier, for display. GenuineFan recomputes its own from the counts. */
  playerScore: number;
  playerTier: FandomTier;
  flags: FandomFlag[];
}

export interface FanSignalsPayload {
  schema: typeof PAYLOAD_SCHEMA;
  scoringVersion: number;
  deviceId: string;
  /** Random per payload; GenuineFan rejects a nonce it has seen (replay protection). */
  nonce: string;
  /** ISO 8601. GenuineFan rejects payloads older than 10 minutes. */
  generatedAt: string;
  window: { days: number; from: string; to: string };
  client: { app: "genuinefan-player"; version: string; platform: string };
  artists: PayloadArtist[];
}

/**
 * Per-artist aggregates only: no track IDs, titles, search text, timestamps of single plays, IP or device details.
 */
export function buildPayload(
  report: FandomReport,
  meta: { deviceId: string; nonce: string; version: string; platform: string; tzOffsetMinutes?: number },
): FanSignalsPayload {
  const tz = meta.tzOffsetMinutes ?? 0;
  return {
    schema: PAYLOAD_SCHEMA,
    scoringVersion: report.scoringVersion,
    deviceId: meta.deviceId,
    nonce: meta.nonce,
    generatedAt: new Date(report.generatedAt).toISOString(),
    window: {
      days: report.windowDays,
      from: dayKey(report.generatedAt - report.windowDays * DAY_MS, tz),
      to: dayKey(report.generatedAt, tz),
    },
    client: { app: "genuinefan-player", version: meta.version, platform: meta.platform },
    artists: report.artists
      .filter((a) => a.verified.qualifiedPlays + a.unverified.qualifiedPlays + a.verified.saves + a.unverified.saves > 0)
      .slice(0, PAYLOAD_ARTIST_LIMIT)
      .map((a) => ({
        artistKey: a.artistKey,
        artistName: a.artistName,
        providerArtistIds: a.providerArtistIds,
        verified: a.verified,
        unverified: a.unverified,
        searches: a.searches,
        firstSeenDay: a.firstSeenDay,
        lastSeenDay: a.lastSeenDay,
        avgCompletion: a.avgCompletion,
        playerScore: a.score,
        playerTier: a.tier,
        flags: a.flags,
      })),
  };
}

/** JSON with object keys sorted at every level: the exact bytes that get signed and verified. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map((v) => (v === undefined ? "null" : canonicalJson(v))).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
    .join(",")}}`;
}
