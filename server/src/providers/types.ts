/**
 * GenuineFan Player: the seam between the app and wherever music comes from.
 *
 * Every music service the player can use is a `MusicProvider`. A provider answers catalog questions (search,
 * artist, album) and says how a track gets played:
 *
 * - `proxy-stream`: this server resolves and proxies the audio itself (only the `youtube-experimental` provider,
 *   which extracts YouTube streams and is NOT allowed by YouTube's Terms of Service; local development only).
 * - `client-sdk`: the server never touches audio. The client plays through the service's official SDK with the
 *   listener's own account (Spotify Web Playback SDK, Apple MusicKit JS). This is the licensed path.
 * - `none`: catalog only (metadata), no playback.
 *
 * See docs/genuinefan-integration.md for the roadmap.
 */
import type { AlbumCard, AlbumPage, ArtistPage } from "../browse.js";
import type { Lang } from "../i18n.js";
import type { Track } from "../types.js";

export type ProviderId = "youtube-experimental" | "spotify" | "apple-music";

export type PlaybackMode = "proxy-stream" | "client-sdk" | "none";

export interface ProviderCapabilities {
  playback: PlaybackMode;
  /** Search, artist and album pages. */
  catalog: boolean;
  /** Music videos (only the experimental YouTube path today). */
  video: boolean;
  /** Playback needs the listener to sign in to the service (and, for Spotify, a Premium plan). */
  requiresUserAuth: boolean;
}

/** How the client should play one track. */
export type PlaybackResolution =
  | {
      mode: "proxy-stream";
      trackId: string;
      title: string;
      duration: number;
      /** A server-merged SD video exists (otherwise video needs the HD download). */
      hasSdVideo: boolean;
      /** Relative URLs on this server. */
      audioUrl: string;
      videoUrl: string;
    }
  | {
      mode: "client-sdk";
      trackId: string;
      /** Which official SDK the client must load and authorize. */
      sdk: "spotify-web-playback" | "apple-musickit-js";
      /** The service's own identifier for the track (e.g. a Spotify URI or an Apple Music catalog ID). */
      serviceTrackId: string;
    };

export interface MusicProvider {
  readonly id: ProviderId;
  /** Shown in the UI and in /api/providers. */
  readonly label: string;
  /** True for anything that isn't licensed playback. Shown prominently. */
  readonly experimental: boolean;
  readonly capabilities: ProviderCapabilities;
  /** Official documentation the implementation follows (no undocumented endpoints). */
  readonly docs: readonly string[];

  /** Whether the credentials this provider needs are present. Stubs return false. */
  isConfigured(): boolean;

  search(query: string, type: "song" | "video", lang: Lang): Promise<Track[]>;
  searchAlbums(query: string, lang: Lang): Promise<AlbumCard[]>;
  artist(id: string, lang: Lang): Promise<ArtistPage>;
  album(id: string, lang: Lang): Promise<AlbumPage>;
  resolvePlayback(trackId: string): Promise<PlaybackResolution>;
}

/** What /api/providers reports for each provider. Never includes credentials. */
export interface ProviderInfo {
  id: ProviderId;
  label: string;
  experimental: boolean;
  enabled: boolean;
  configured: boolean;
  capabilities: ProviderCapabilities;
  docs: readonly string[];
}

/** Thrown by a provider that has no credentials or no implementation yet. */
export class ProviderNotConfiguredError extends Error {
  /** Read by the server's error handler (501 Not Implemented). */
  readonly statusCode = 501;
  constructor(
    public readonly provider: ProviderId,
    detail: string,
  ) {
    super(`Music provider "${provider}" is not configured: ${detail}`);
    this.name = "ProviderNotConfiguredError";
  }
}
