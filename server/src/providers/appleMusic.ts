/**
 * `apple-music`: SCAFFOLD ONLY. Every method throws ProviderNotConfiguredError until it is implemented.
 *
 * Intended design (licensed playback, the server never touches audio):
 * - Playback in the browser with MusicKit JS. Full-length playback needs an Apple Music subscriber to sign in.
 *     https://developer.apple.com/documentation/musickitjs
 *     https://developer.apple.com/musickit/
 * - Two tokens:
 *   - a developer token (a JWT signed server-side with a MusicKit private key from the Apple Developer account;
 *     the key must never reach the client),
 *       https://developer.apple.com/documentation/applemusicapi/generating-developer-tokens
 *   - a music user token, obtained in the client when the listener authorizes MusicKit.
 *       https://developer.apple.com/documentation/applemusicapi/user-authentication-for-musickit
 * - Catalog (search, artists, albums) through the Apple Music API, using only documented endpoints.
 *     https://developer.apple.com/documentation/applemusicapi
 *
 * GenuineFan already integrates Apple Music in the genuine-fan repo; reuse its developer-token issuance
 * instead of adding a second signing key here (TODO when this is implemented).
 */
import { ProviderNotConfiguredError, type MusicProvider } from "./types.js";

const notConfigured = (): never => {
  throw new ProviderNotConfiguredError(
    "apple-music",
    "Apple Music playback needs a MusicKit developer token (signed server-side) and the listener's music user token from MusicKit JS. Not implemented yet: see server/src/providers/appleMusic.ts.",
  );
};

export const appleMusic: MusicProvider = {
  id: "apple-music",
  label: "Apple Music (not configured)",
  experimental: false,
  capabilities: { playback: "client-sdk", catalog: true, video: false, requiresUserAuth: true },
  docs: [
    "https://developer.apple.com/documentation/musickitjs",
    "https://developer.apple.com/documentation/applemusicapi",
    "https://developer.apple.com/documentation/applemusicapi/generating-developer-tokens",
    "https://developer.apple.com/documentation/applemusicapi/user-authentication-for-musickit",
  ],

  isConfigured: () => false,

  search: async () => notConfigured(),
  searchAlbums: async () => notConfigured(),
  artist: async () => notConfigured(),
  album: async () => notConfigured(),
  resolvePlayback: async () => notConfigured(),
};
