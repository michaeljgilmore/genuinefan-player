/**
 * `youtube-experimental`: Musike's original path, unchanged, behind the MusicProvider interface.
 *
 * Catalog: YouTube Music through youtubei.js (search.ts, browse.ts).
 * Playback: yt-dlp resolves the stream and this server proxies the bytes (ytdlp.ts, stream.ts).
 *
 * WARNING: extracting YouTube streams goes against YouTube's Terms of Service (https://www.youtube.com/t/terms).
 * This provider exists only so the GenuineFan Player experiment can be developed locally. It is not, and must not
 * become, part of a public or monetized GenuineFan service. See docs/genuinefan-integration.md.
 */
import { album, artist, searchAlbums } from "../browse.js";
import { search } from "../search.js";
import { resolveStreams } from "../ytdlp.js";
import type { MusicProvider } from "./types.js";

export const youtubeExperimental: MusicProvider = {
  id: "youtube-experimental",
  label: "YouTube (experimental, local dev only)",
  experimental: true,
  capabilities: { playback: "proxy-stream", catalog: true, video: true, requiresUserAuth: false },
  docs: ["https://github.com/LuanRT/YouTube.js", "https://github.com/yt-dlp/yt-dlp", "https://www.youtube.com/t/terms"],

  isConfigured: () => true,

  search: (query, type, lang) => search(query, type, lang),
  searchAlbums: (query, lang) => searchAlbums(query, lang),
  artist: (id, lang) => artist(id, lang),
  album: (id, lang) => album(id, lang),

  async resolvePlayback(trackId) {
    const r = await resolveStreams(trackId);
    return {
      mode: "proxy-stream",
      trackId: r.id,
      title: r.title,
      duration: r.duration,
      hasSdVideo: !!r.video,
      audioUrl: `/api/stream/${r.id}/audio`,
      videoUrl: `/api/stream/${r.id}/video`,
    };
  },
};
