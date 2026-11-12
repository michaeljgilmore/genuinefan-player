import { fileURLToPath } from "node:url";
import path from "node:path";

// Folder of the server package (bundled builds pass every path through env instead).
const root = typeof import.meta.url === "string" ? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..") : process.cwd();

/** "1"/"true"/"yes" → true, "0"/"false"/"no" → false, anything else → undefined (use the default). */
function flag(v: string | undefined): boolean | undefined {
  if (v == null) return undefined;
  if (/^(1|true|yes|on)$/i.test(v.trim())) return true;
  if (/^(0|false|no|off)$/i.test(v.trim())) return false;
  return undefined;
}

type ProviderId = "youtube-experimental" | "spotify" | "apple-music";
const PROVIDER_IDS: readonly ProviderId[] = ["youtube-experimental", "spotify", "apple-music"];
const defaultProvider = process.env.GENUINEFAN_DEFAULT_PROVIDER;

export const config = {
  /** Reported in Fan Signals payloads. */
  appVersion: process.env.GENUINEFAN_PLAYER_VERSION || "1.5.1-gf",
  /** Reported in Fan Signals payloads ("desktop" from the Electron app, "server-darwin" etc. otherwise). */
  platform: process.env.GENUINEFAN_PLATFORM || `server-${process.platform}`,
  port: Number(process.env.PORT ?? 4180),
  /**
   * Local only by default. Set HOST=0.0.0.0 to reach the server from other devices on your network (the Docker
   * image does); there is no login, so only do that on a network you trust.
   */
  host: process.env.HOST ?? "127.0.0.1",
  /** Explicit yt-dlp executable. When unset it is located automatically (see tools.ts). */
  ytdlpPath: process.env.YTDLP_PATH || null,
  // Extra yt-dlp flags, e.g. YTDLP_EXTRA_ARGS="--cookies-from-browser firefox"
  ytdlpExtraArgs: (process.env.YTDLP_EXTRA_ARGS ?? "").split(" ").filter(Boolean),
  dataDir: process.env.MUSIKE_DATA_DIR ?? path.join(root, "data"),
  cacheDir: process.env.MUSIKE_CACHE_DIR ?? path.join(root, "cache"),
  /** HD video cache limit; least recently played videos are evicted first. */
  cacheMaxBytes: Number(process.env.MUSIKE_CACHE_MAX_MB ?? 2048) * 1024 * 1024,
  webDist: process.env.MUSIKE_WEB_DIST ?? path.resolve(root, "..", "web", "dist"),
  /**
   * Private folder for yt-dlp, Deno and FFmpeg downloaded by Musike itself (the desktop app sets it).
   * Searched before the system PATH, and where "Instalar" puts the tools when set.
   */
  binDir: process.env.MUSIKE_BIN_DIR || null,
  /** YouTube Music language when a request doesn't say (the app always does). */
  lang: process.env.MUSIKE_LANG ?? "en",
  location: process.env.MUSIKE_LOCATION ?? "BR",
  /** Music providers (server/src/providers). */
  providers: {
    default: (PROVIDER_IDS as readonly string[]).includes(defaultProvider ?? "") ? (defaultProvider as ProviderId) : ("youtube-experimental" as ProviderId),
    /**
     * The YouTube extraction path goes against YouTube's Terms of Service, so it is on by default only for local
     * development (NODE_ENV isn't "production"; the Docker image sets production). Force it with
     * GENUINEFAN_YOUTUBE_EXPERIMENTAL=1 or 0. Never enable it on a public or monetized deployment.
     */
    youtubeExperimental: flag(process.env.GENUINEFAN_YOUTUBE_EXPERIMENTAL) ?? process.env.NODE_ENV !== "production",
  },
  /** GenuineFan Fan Signals (docs/genuinefan-integration.md). Recording and sharing are opt-in per listener. */
  genuineFan: {
    /** Operator kill switch: GENUINEFAN_RECORD_LISTENING=0 drops every event whatever listeners chose. */
    recordListening: flag(process.env.GENUINEFAN_RECORD_LISTENING) ?? true,
    /** GenuineFan web app, where a signed-in fan approves this player (the /player/link page). */
    appUrl: process.env.GENUINEFAN_APP_URL || "https://genuinefan.vip",
    /**
     * HTTPS endpoint that accepts signed per-artist summaries (GenuineFan's `ingestFanSignals` function). Unset by
     * default because GenuineFan doesn't run it yet: "Sync now" then explains that nothing was sent.
     */
    fanSignalsEndpoint: process.env.GENUINEFAN_FAN_SIGNALS_ENDPOINT || null,
  },
  /** HTTP for youtubei.js; the platform's own fetch here (the Android app passes its native one). */
  fetch: undefined as typeof fetch | undefined,
};
