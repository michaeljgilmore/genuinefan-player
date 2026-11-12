/**
 * `spotify`: SCAFFOLD ONLY. Every method throws ProviderNotConfiguredError until it is implemented.
 *
 * Intended design (licensed playback, the server never touches audio):
 * - Playback in the browser with the Spotify Web Playback SDK, which requires the listener to have Spotify
 *   Premium and to authorize this app with their own Spotify account.
 *     https://developer.spotify.com/documentation/web-playback-sdk
 *     https://developer.spotify.com/documentation/web-playback-sdk/reference
 * - User OAuth with the Authorization Code with PKCE flow (no client secret in the client).
 *     https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow
 * - Catalog (search, artists, albums) through the Spotify Web API, using only documented endpoints.
 *     https://developer.spotify.com/documentation/web-api
 * - Before storing or deriving anything from Spotify data (e.g. GenuineFan fan-score signals), review the
 *   Spotify Developer Policy and Terms: https://developer.spotify.com/policy
 *
 * GenuineFan already integrates Spotify OAuth in the genuine-fan repo; reuse that app registration and consent
 * flow rather than creating a second one (TODO when this is implemented).
 */
import { ProviderNotConfiguredError, type MusicProvider } from "./types.js";

const notConfigured = (): never => {
  throw new ProviderNotConfiguredError(
    "spotify",
    "Spotify playback needs a registered Spotify app (client ID), the listener's OAuth token (Authorization Code with PKCE) and Spotify Premium. Not implemented yet: see server/src/providers/spotify.ts.",
  );
};

export const spotify: MusicProvider = {
  id: "spotify",
  label: "Spotify (not configured)",
  experimental: false,
  capabilities: { playback: "client-sdk", catalog: true, video: false, requiresUserAuth: true },
  docs: [
    "https://developer.spotify.com/documentation/web-playback-sdk",
    "https://developer.spotify.com/documentation/web-api",
    "https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow",
    "https://developer.spotify.com/policy",
  ],

  isConfigured: () => false,

  search: async () => notConfigured(),
  searchAlbums: async () => notConfigured(),
  artist: async () => notConfigured(),
  album: async () => notConfigured(),
  resolvePlayback: async () => notConfigured(),
};
