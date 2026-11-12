import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { verifyEnvelope, type SignedEnvelope } from "../src/fanLink.js";
import type { LibraryStorage } from "../src/library.js";
import * as listening from "../src/listening.js";

let file: string | null = null;
const memory: LibraryStorage = { read: async () => file, write: async (json) => void (file = json) };
const OPTS = { appUrl: "https://genuinefan.vip", endpoint: "https://example.test/ingestFanSignals", version: "test", platform: "test", deviceLabel: "test" };
const play = { type: "play_started", provider: "youtube-experimental", trackId: "dQw4w9WgXcQ", artist: "Rick Astley", artistId: null };

describe("listening log and Fan Signals", () => {
  beforeEach(() => {
    file = null;
    listening.useListeningStorage(memory);
  });

  it("records nothing until the listener opts in", async () => {
    assert.equal(await listening.recordListening(play), null);
    assert.equal((await listening.listListening()).length, 0);
    await listening.setConsent({ recording: true });
    assert.ok(await listening.recordListening(play));
    assert.equal((await listening.listListening()).length, 1);
  });

  it("respects the operator kill switch", async () => {
    listening.useListeningStorage(memory, { record: false });
    await listening.setConsent({ recording: true });
    assert.equal(await listening.recordListening(play), null);
  });

  it("upgrades a version 1 log with recording off", async () => {
    file = JSON.stringify({ version: 1, events: [{ id: "1", type: "play_completed", provider: "youtube-experimental", trackId: "dQw4w9WgXcQ", artist: "Rick Astley", artistId: null, at: Date.now() }] });
    listening.useListeningStorage(memory);
    const s = await listening.getFanSignals({ endpointConfigured: false });
    assert.equal(s.consent.recording, false);
    assert.equal(s.events, 1);
    assert.equal(s.report.artists[0]?.artistName, "Rick Astley");
  });

  it("validates and clamps play_finished", async () => {
    const e = listening.sanitizeEvent({ ...play, type: "play_finished", listenedSec: 9999, durationSec: 200, completion: 3 });
    assert.equal(e.listenedSec, 205);
    assert.equal(e.completion, 1);
    assert.throws(() => listening.sanitizeEvent({ type: "search", provider: "spotify", query: "" }));
    assert.throws(() => listening.sanitizeEvent({ ...play, type: "nope" }));
  });

  it("sharing needs recording and a link", async () => {
    await listening.setConsent({ recording: true, sharing: true });
    assert.equal((await listening.getFanSignals({ endpointConfigured: true })).consent.sharing, false);
    await listening.startLink(OPTS);
    await listening.setConsent({ sharing: true });
    assert.equal((await listening.getFanSignals({ endpointConfigured: true })).consent.sharing, true);
    await listening.setConsent({ recording: false });
    assert.equal((await listening.getFanSignals({ endpointConfigured: true })).consent.sharing, false);
  });

  it("signs the payload with the linked device key and marks the link once GenuineFan accepts it", async () => {
    await listening.setConsent({ recording: true });
    await listening.recordListening({ ...play, type: "play_finished", listenedSec: 200, durationSec: 200, completion: 1 });
    const { url, deviceId } = await listening.startLink(OPTS);
    const key = new URL(url).searchParams.get("key")!;
    assert.equal(new URL(url).pathname, "/player/link");
    await listening.setConsent({ sharing: true });

    let sent: SignedEnvelope | null = null;
    const fakeFetch = (async (_url: string, init: RequestInit) => {
      sent = JSON.parse(String(init.body)) as SignedEnvelope;
      return new Response(JSON.stringify({ linked: true, account: "@michael", accepted: 1 }), { status: 200 });
    }) as unknown as typeof fetch;

    const result = await listening.syncNow({ ...OPTS, fetch: fakeFetch });
    assert.equal(result.ok, true);
    assert.ok(sent);
    const env = sent as SignedEnvelope;
    assert.equal(env.deviceId, deviceId);
    assert.equal(await verifyEnvelope(env, key), true);
    assert.equal(await verifyEnvelope({ ...env, payload: env.payload.replace("Rick Astley", "Someone Else") }, key), false);
    const payload = JSON.parse(env.payload);
    assert.equal(payload.artists[0].unverified.completedPlays, 1);
    const state = await listening.getFanSignals({ endpointConfigured: true });
    assert.equal(state.link.status, "linked");
    assert.equal(state.link.account, "@michael");
  });

  it("refuses to sync without an endpoint, and keeps the link pending when GenuineFan doesn't know the device", async () => {
    await listening.setConsent({ recording: true });
    await listening.startLink(OPTS);
    await listening.setConsent({ sharing: true });
    await assert.rejects(listening.syncNow({ ...OPTS, endpoint: null }));
    const notFound = (async () => new Response(JSON.stringify({ error: "unknown device" }), { status: 404 })) as unknown as typeof fetch;
    const r = await listening.syncNow({ ...OPTS, fetch: notFound });
    assert.equal(r.ok, false);
    assert.equal((await listening.getFanSignals({ endpointConfigured: true })).link.status, "pending");
  });

  it("clear keeps consent; unlink drops the key", async () => {
    await listening.setConsent({ recording: true });
    await listening.recordListening(play);
    await listening.startLink(OPTS);
    await listening.clearListening();
    let s = await listening.getFanSignals({ endpointConfigured: false });
    assert.equal(s.events, 0);
    assert.equal(s.consent.recording, true);
    assert.ok(s.link.deviceId);
    await listening.unlink();
    s = await listening.getFanSignals({ endpointConfigured: false });
    assert.equal(s.link.deviceId, null);
    assert.equal(s.link.status, "none");
  });
});
