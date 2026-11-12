import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildPayload,
  canonicalJson,
  computeFandom,
  currentStreak,
  normalizeName,
  primaryArtist,
  type SignalEvent,
  type SignalProvider,
} from "../src/fanSignals.js";

const DAY = 86_400_000;
const NOW = Date.parse("2026-11-11T20:00:00Z");

/** One full listen: started, then finished at `completion`. */
function listen(
  artist: string,
  trackId: string,
  daysAgo: number,
  opts: { provider?: SignalProvider; completion?: number; duration?: number; minute?: number; repeat?: boolean } = {},
): SignalEvent[] {
  const provider = opts.provider ?? "spotify";
  const duration = opts.duration ?? 200;
  const completion = opts.completion ?? 1;
  const at = NOW - daysAgo * DAY + (opts.minute ?? 0) * 60_000 - 3600_000;
  return [
    { type: "play_started", provider, trackId, artist, at, repeat: opts.repeat },
    { type: "play_finished", provider, trackId, artist, at: at + duration * completion * 1000, listenedSec: duration * completion, durationSec: duration, completion },
  ];
}

describe("names", () => {
  it("normalizes accents, case and punctuation", () => {
    assert.equal(normalizeName("Beyoncé"), "beyonce");
    assert.equal(normalizeName("  AC/DC "), "ac dc");
    assert.equal(normalizeName("Simon & Garfunkel"), "simon and garfunkel");
  });
  it("takes the primary artist of a credit", () => {
    assert.equal(primaryArtist("Taylor Swift feat. Ed Sheeran"), "Taylor Swift");
    assert.equal(primaryArtist("Anitta, Cardi B & Myke Towers"), "Anitta");
    assert.equal(primaryArtist("Disclosure x Sam Smith"), "Disclosure");
    assert.equal(primaryArtist("Simon & Garfunkel"), "Simon");
  });
});

describe("streaks", () => {
  it("counts consecutive days ending today or yesterday", () => {
    assert.equal(currentStreak(["2026-11-09", "2026-11-10", "2026-11-11"], "2026-11-11"), 3);
    assert.equal(currentStreak(["2026-11-09", "2026-11-10"], "2026-11-11"), 2);
    assert.equal(currentStreak(["2026-11-08", "2026-11-09"], "2026-11-11"), 0);
    assert.equal(currentStreak([], "2026-11-11"), 0);
  });
});

describe("computeFandom", () => {
  it("returns nothing for an empty log", () => {
    const r = computeFandom([], { now: NOW });
    assert.equal(r.artists.length, 0);
    assert.equal(r.summary.streakDays, 0);
  });

  it("counts qualified, completed and skipped plays", () => {
    const events = [
      ...listen("Phoebe Bridgers", "a", 1),
      ...listen("Phoebe Bridgers", "b", 1, { completion: 0.6, minute: 10 }),
      // A 10-second skip of a 200 s track: started but not qualified.
      ...listen("Phoebe Bridgers", "c", 1, { completion: 0.05, minute: 20 }),
    ];
    const [a] = computeFandom(events, { now: NOW }).artists;
    assert.ok(a);
    assert.equal(a.verified.plays, 3);
    assert.equal(a.verified.qualifiedPlays, 2);
    assert.equal(a.verified.completedPlays, 1);
    assert.equal(a.verified.distinctTracks, 2);
    assert.equal(a.verified.activeDays, 1);
  });

  it("rewards a deep, consistent, verified fan with VIP", () => {
    const events: SignalEvent[] = [];
    for (let d = 0; d < 25; d++) for (let k = 0; k < 2; k++) events.push(...listen("Mitski", `t${(d * 2 + k) % 14}`, d, { minute: k * 10 }));
    for (let i = 0; i < 6; i++) events.push({ type: "like", provider: "spotify", trackId: `t${i}`, artist: "Mitski", at: NOW - 40 * DAY + i });
    for (let i = 0; i < 6; i++) events.push(...listen("Mitski", "t0", 2, { minute: 100 + i * 4, repeat: true }));
    for (let i = 0; i < 4; i++) events.push({ type: "search", provider: "spotify", query: `mitski ${i}`, at: NOW - i * DAY });
    const [a] = computeFandom(events, { now: NOW }).artists;
    assert.ok(a);
    assert.equal(a.tier, "vip");
    assert.ok(a.score >= 85, `score ${a.score}`);
    assert.equal(a.verified.streakDays, 25);
    assert.equal(a.searches, 4);
    assert.equal(a.verified.saves, 6);
    assert.ok(a.badges.includes("verified_listener"));
    assert.ok(a.badges.includes("deep_cuts"));
    assert.ok(a.badges.includes("streak_7"));
    assert.ok(a.badges.includes("on_repeat"));
    assert.deepEqual(a.flags, []);
  });

  it("weights unverified (experimental YouTube) plays low and caps them below GenuineFan", () => {
    const make = (provider: SignalProvider) => {
      const events: SignalEvent[] = [];
      for (let d = 0; d < 25; d++) for (let k = 0; k < 2; k++) events.push(...listen("Mitski", `t${(d * 2 + k) % 14}`, d, { provider, minute: k * 10 }));
      return computeFandom(events, { now: NOW }).artists[0]!;
    };
    const verified = make("spotify");
    const unverified = make("youtube-experimental");
    assert.ok(unverified.score < verified.score);
    assert.ok(unverified.score <= 40, `unverified score ${unverified.score}`);
    assert.notEqual(unverified.tier, "genuine");
    assert.notEqual(unverified.tier, "vip");
    assert.ok(unverified.flags.includes("unverified_plays"));
    assert.equal(unverified.verifiedShare, 0);
    assert.equal(unverified.unverified.qualifiedPlays, 50);
  });

  it("flags and penalizes implausible volume and bursts", () => {
    const events: SignalEvent[] = [];
    // 300 full plays of a 200 s track in one day = 16.7 hours.
    for (let i = 0; i < 300; i++) events.push(...listen("Band", `t${i % 30}`, 0, { minute: -i }));
    const [a] = computeFandom(events, { now: NOW }).artists;
    assert.ok(a);
    assert.ok(a.flags.includes("implausible_volume"));
    assert.ok(a.flags.includes("burst"));
    assert.notEqual(a.tier, "vip");
    assert.ok(a.score < 50, `score ${a.score}`);
  });

  it("flags a single track on loop", () => {
    const events: SignalEvent[] = [];
    for (let d = 0; d < 3; d++) for (let i = 0; i < 10; i++) events.push(...listen("Loop", "same", d, { minute: i * 4 }));
    const [a] = computeFandom(events, { now: NOW }).artists;
    assert.ok(a);
    assert.ok(a.flags.includes("loop_pattern"));
  });

  it("ignores plays outside the window but keeps saves", () => {
    const events = [
      ...listen("Old", "x", 120),
      { type: "like", provider: "spotify", trackId: "x", artist: "Old", at: NOW - 120 * DAY } as SignalEvent,
    ];
    const [a] = computeFandom(events, { now: NOW, windowDays: 90 }).artists;
    assert.ok(a);
    assert.equal(a.verified.plays, 0);
    assert.equal(a.verified.saves, 1);
  });

  it("removes unliked tracks from saves", () => {
    const events: SignalEvent[] = [
      ...listen("A", "1", 1),
      { type: "like", provider: "spotify", trackId: "1", artist: "A", at: NOW - 3 * DAY },
      { type: "unlike", provider: "spotify", trackId: "1", artist: "A", at: NOW - 2 * DAY },
    ];
    assert.equal(computeFandom(events, { now: NOW }).artists[0]!.verified.saves, 0);
  });

  it("merges featured credits into the primary artist", () => {
    const events = [...listen("Dua Lipa", "1", 1), ...listen("Dua Lipa feat. DaBaby", "2", 1, { minute: 5 })];
    const r = computeFandom(events, { now: NOW });
    assert.equal(r.artists.length, 1);
    assert.equal(r.artists[0]!.verified.distinctTracks, 2);
  });

  it("reads legacy play_completed events as full listens", () => {
    const events: SignalEvent[] = [{ type: "play_completed", provider: "youtube-experimental", trackId: "dQw4w9WgXcQ", artist: "Rick Astley", at: NOW - DAY }];
    const [a] = computeFandom(events, { now: NOW }).artists;
    assert.ok(a);
    assert.equal(a.unverified.completedPlays, 1);
  });

  it("counts days in the listener's time zone", () => {
    // 2026-11-11T02:00Z is still Nov 10 in Los Angeles (UTC-8).
    const at = Date.parse("2026-11-11T02:00:00Z");
    const events: SignalEvent[] = [
      { type: "play_started", provider: "spotify", trackId: "1", artist: "A", at },
      { type: "play_finished", provider: "spotify", trackId: "1", artist: "A", at: at + 1000, listenedSec: 200, durationSec: 200, completion: 1 },
    ];
    assert.equal(computeFandom(events, { now: NOW, tzOffsetMinutes: -480 }).artists[0]!.lastSeenDay, "2026-11-10");
    assert.equal(computeFandom(events, { now: NOW }).artists[0]!.lastSeenDay, "2026-11-11");
  });
});

describe("payload", () => {
  it("carries per-artist aggregates only", () => {
    const events: SignalEvent[] = [...listen("Mitski", "secret-track-id", 1), { type: "search", provider: "spotify", query: "mitski private search", at: NOW - 1000 }];
    const payload = buildPayload(computeFandom(events, { now: NOW }), { deviceId: "gfp_x", nonce: "n", version: "1", platform: "test" });
    const text = JSON.stringify(payload);
    assert.equal(payload.schema, "vip.genuinefan.player.fan-signals/v1");
    assert.equal(payload.artists.length, 1);
    assert.ok(!text.includes("secret-track-id"), "no track IDs");
    assert.ok(!text.includes("private search"), "no search text");
    assert.equal(payload.window.to, "2026-11-11");
  });

  it("canonical JSON sorts keys at every level", () => {
    assert.equal(canonicalJson({ b: 1, a: { d: [1, { z: 1, y: 2 }], c: null } }), '{"a":{"c":null,"d":[1,{"y":2,"z":1}]},"b":1}');
  });
});
