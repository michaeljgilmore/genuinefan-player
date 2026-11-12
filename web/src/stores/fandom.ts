import { create } from "zustand";
import { getT } from "../i18n";
import { api, type FanConsent, type FanSignalsPayload, type FanSignalsState } from "../lib/api";
import { setRecordingHint } from "../lib/listening";
import { toast } from "./ui";

/** Minutes east of UTC, so days and streaks match the listener's calendar. */
const tz = () => -new Date().getTimezoneOffset();

interface FandomStore {
  status: "idle" | "loading" | "ready" | "error";
  state: FanSignalsState | null;
  preview: FanSignalsPayload | null;
  busy: boolean;
  load: () => Promise<void>;
  setConsent: (patch: Partial<Pick<FanConsent, "recording" | "sharing">>) => Promise<void>;
  clear: () => Promise<void>;
  link: () => Promise<void>;
  unlink: () => Promise<void>;
  loadPreview: () => Promise<void>;
  sync: () => Promise<void>;
}

export const useFandom = create<FandomStore>((set, get) => {
  const run = async (fn: () => Promise<void>) => {
    set({ busy: true });
    try {
      await fn();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      set({ busy: false });
      await get().load();
    }
  };

  return {
    status: "idle",
    state: null,
    preview: null,
    busy: false,

    load: async () => {
      if (!get().state) set({ status: "loading" });
      try {
        const state = await api.fanSignals(tz());
        setRecordingHint(state.allowed && state.consent.recording);
        set({ state, status: "ready" });
      } catch {
        set({ status: "error" });
      }
    },

    setConsent: (patch) =>
      run(async () => {
        const consent = await api.setFanConsent(patch);
        setRecordingHint(consent.recording);
        const t = getT().fandom;
        if (patch.recording !== undefined) toast(patch.recording ? t.recordingOn : t.recordingOff);
        if (patch.sharing !== undefined) toast(patch.sharing ? t.sharingOn : t.sharingOff);
      }),

    clear: () =>
      run(async () => {
        await api.clearListening();
        set({ preview: null });
        toast(getT().fandom.cleared);
      }),

    link: () =>
      run(async () => {
        const { url } = await api.startFanLink();
        window.open(url, "_blank", "noopener");
        toast(getT().fandom.linkOpened);
      }),

    unlink: () =>
      run(async () => {
        await api.unlinkFan();
        set({ preview: null });
        toast(getT().fandom.unlinked);
      }),

    loadPreview: () =>
      run(async () => {
        set({ preview: await api.previewFanSync(tz()) });
      }),

    sync: () =>
      run(async () => {
        const r = await api.syncFanSignals(tz());
        const t = getT().fandom;
        toast(r.ok ? t.synced(r.artists) : t.syncFailed(r.message), r.ok ? "info" : "error");
      }),
  };
});
