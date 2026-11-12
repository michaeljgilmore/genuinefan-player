/**
 * The provider registry. The app routes catalog and playback requests to the active provider.
 *
 * Today the only working provider is `youtube-experimental`, and it is enabled by default only for local
 * development (see `config.providers`). Spotify and Apple Music are typed stubs for the licensed path.
 */
import { config } from "../config.js";
import { msg } from "../i18n.js";
import { HttpError } from "../types.js";
import { appleMusic } from "./appleMusic.js";
import { spotify } from "./spotify.js";
import type { MusicProvider, ProviderId, ProviderInfo } from "./types.js";
import { youtubeExperimental } from "./youtube.js";

export * from "./types.js";

const PROVIDERS: Record<ProviderId, MusicProvider> = {
  "youtube-experimental": youtubeExperimental,
  spotify,
  "apple-music": appleMusic,
};

export const isProviderId = (v: unknown): v is ProviderId => typeof v === "string" && Object.hasOwn(PROVIDERS, v);

/** A provider is enabled when config allows it. Stubs are always "enabled" so they can report "not configured". */
function enabled(p: MusicProvider): boolean {
  return p.id === "youtube-experimental" ? config.providers.youtubeExperimental : true;
}

export function listProviders(): ProviderInfo[] {
  return Object.values(PROVIDERS).map((p) => ({
    id: p.id,
    label: p.label,
    experimental: p.experimental,
    enabled: enabled(p),
    configured: p.isConfigured(),
    capabilities: p.capabilities,
    docs: p.docs,
  }));
}

/** The provider by ID, or a clear error when it's switched off. */
export function provider(id: ProviderId): MusicProvider {
  const p = PROVIDERS[id];
  if (!enabled(p)) throw new HttpError(503, msg("providerDisabled", { provider: id }));
  return p;
}

/** The provider the app uses when a request doesn't name one. */
export const activeProvider = (): MusicProvider => provider(config.providers.default);
