import type { FandomReport, FanSignalsPayload } from "../../../server/src/fanSignals";
import type { AlbumCard, AlbumPage, ArtistPage, Genre, GenreArtist, GenrePage, Library, Playlist, Track } from "./types";

/**
 * What the app needs from a backend. The web app and the desktop app talk to the GenuineFan Player server over HTTP
 * (lib/api.ts); the Android app does the same work on the phone (native/api.ts). The build picks one.
 */

export type ErrorCode = "tool_missing" | "maybe_outdated" | "bot_check";

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: ErrorCode) {
    super(message);
  }
}

export type Channel = "stable" | "nightly";

export interface ImportResult {
  playlistsAdded: number;
  playlistsMerged: number;
  tracksAdded: number;
  favoritesAdded: number;
}

export interface SystemJob {
  kind: "update" | "install";
  channel: Channel;
  status: "running" | "done" | "error";
  startedAt: number;
  finishedAt?: number;
  from: string | null;
  to: string | null;
  message: string;
  log: string[];
}

export interface SystemInfo {
  ytdlp: {
    path: string | null;
    version: string | null;
    channel: Channel;
    latest: Record<Channel, string | null>;
    updateAvailable: boolean;
  };
  deno: string | null;
  ffmpeg: string | null;
  canInstall: boolean;
  job: SystemJob | null;
}

export type ProviderId = "youtube-experimental" | "spotify" | "apple-music";

/** A Fan Signals event (see server/src/listening.ts). Ignored by the backend unless the listener opted in. */
export type ListeningEventInput =
  | { type: "search"; provider: ProviderId; query: string }
  | {
      type: "play_started" | "like" | "unlike";
      provider: ProviderId;
      trackId: string;
      artist: string;
      artistId: string | null;
      repeat?: boolean;
    }
  | {
      type: "play_finished";
      provider: ProviderId;
      trackId: string;
      artist: string;
      artistId: string | null;
      listenedSec: number;
      durationSec: number;
      completion: number;
    };

export type { FandomReport, FanSignalsPayload };
export type { ArtistFandom, FandomBadge, FandomFlag, FandomTier } from "../../../server/src/fanSignals";

export interface FanConsent {
  recording: boolean;
  sharing: boolean;
  updatedAt: number | null;
}

export interface FanSyncResult {
  at: number;
  ok: boolean;
  artists: number;
  message: string;
}

export interface FanSignalsState {
  /** False when the operator switched recording off for everyone (GENUINEFAN_RECORD_LISTENING=0). */
  allowed: boolean;
  consent: FanConsent;
  link: {
    status: "none" | "pending" | "linked";
    startedAt: number | null;
    linkedAt: number | null;
    account: string | null;
    deviceId: string | null;
  };
  sync: { endpointConfigured: boolean; lastSync: FanSyncResult | null };
  events: number;
  report: FandomReport;
}

export interface Prepared {
  id: string;
  title: string;
  duration: number;
  hasSdVideo: boolean;
}

/**
 * The operating system's media controls (notification, lock screen, headphone buttons) when the browser's
 * Media Session can't reach them: the Android app. Absent elsewhere.
 */
export interface SystemMedia {
  setTrack(track: { title: string; artist: string; album: string; artwork: string }): void;
  setState(state: { playing: boolean; position: number; duration: number }): void;
  onAction(handler: (action: "play" | "pause" | "next" | "previous" | "seek", position?: number) => void): void;
}

export interface MusikeApi {
  search(q: string, type: "song" | "video", signal?: AbortSignal): Promise<Track[]>;
  suggest(q: string, signal?: AbortSignal): Promise<string[]>;
  radio(id: string): Promise<Track[]>;
  genres(): Promise<Genre[]>;
  genre(id: string, signal?: AbortSignal): Promise<GenrePage>;
  genreArtists(id: string, offset: number): Promise<{ artists: GenreArtist[]; hasMore: boolean }>;
  artist(id: string, signal?: AbortSignal): Promise<ArtistPage>;
  album(id: string, signal?: AbortSignal): Promise<AlbumPage>;
  searchAlbums(q: string, signal?: AbortSignal): Promise<AlbumCard[]>;
  /** The music video matching a song, or null when YouTube has none. */
  videoFor(t: Track): Promise<Track | null>;
  prepare(id: string, signal?: AbortSignal): Promise<Prepared>;

  library(): Promise<Library>;
  addFavorite(t: Track): Promise<{ favorites: Track[] }>;
  addFavorites(tracks: Track[]): Promise<{ favorites: Track[] }>;
  removeFavorite(id: string): Promise<{ favorites: Track[] }>;
  pushHistory(t: Track): Promise<{ history: Track[] }>;
  createPlaylist(name: string, tracks?: Track[]): Promise<Playlist>;
  renamePlaylist(id: string, name: string): Promise<Playlist>;
  deletePlaylist(id: string): Promise<void>;
  addToPlaylist(id: string, t: Track | Track[]): Promise<Playlist>;
  removeFromPlaylist(id: string, trackId: string): Promise<Playlist>;
  importLibrary(backup: unknown, mode: "merge" | "replace"): Promise<ImportResult>;

  /** Records a Fan Signals event locally (dropped unless the listener opted in). Raw events never leave the device. */
  recordListening(e: ListeningEventInput): Promise<void>;
  /** Deletes every recorded event. Consent and the GenuineFan link stay. */
  clearListening(): Promise<void>;
  /** Consent, link status and the per-artist fandom report. `tz` is minutes east of UTC. */
  fanSignals(tz: number): Promise<FanSignalsState>;
  setFanConsent(patch: Partial<Pick<FanConsent, "recording" | "sharing">>): Promise<FanConsent>;
  /** Creates this device's key and returns the GenuineFan page where the fan approves it. */
  startFanLink(): Promise<{ url: string; deviceId: string }>;
  unlinkFan(): Promise<void>;
  /** Exactly what "Sync now" would send (unsigned). */
  previewFanSync(tz: number): Promise<FanSignalsPayload>;
  syncFanSignals(tz: number): Promise<FanSyncResult>;

  system(): Promise<SystemInfo>;
  updateYtdlp(channel: Channel): Promise<SystemJob>;
}
