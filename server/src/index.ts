import { existsSync } from "node:fs";
import { networkInterfaces } from "node:os";
import path from "node:path";
import { startServer } from "./app.js";
import { config } from "./config.js";

const { port, tools } = await startServer();

const lan = Object.values(networkInterfaces())
  .flat()
  .filter((i) => i && i.family === "IPv4" && !i.internal)
  .map((i) => `http://${i!.address}:${port}`);
console.log(`\n  GenuineFan Player is running (private GenuineFan experiment, inspired by Musike)`);
console.log(`  Local:   http://localhost:${port}`);
if (config.host === "0.0.0.0" || config.host === "::") for (const url of lan) console.log(`  Network: ${url}`);
else console.log(`  Network: off (HOST=${config.host}; set HOST=0.0.0.0 to allow other devices)`);
if (!existsSync(config.webDist)) console.log(`  (web app not built: run "pnpm build" or use "pnpm dev")`);
console.log(`  yt-dlp:  ${tools.ytdlp ?? "NOT FOUND (install it from GenuineFan Player's Settings)"}`);
if (!tools.deno) console.log(`  Deno:    not found (YouTube may fail without it)`);
if (!tools.ffmpeg) console.log(`  FFmpeg:  not found (HD video unavailable)`);
console.log(
  config.providers.youtubeExperimental
    ? `  YouTube: experimental provider ON (local development only; against YouTube's Terms of Service)`
    : `  YouTube: experimental provider OFF (set GENUINEFAN_YOUTUBE_EXPERIMENTAL=1 for local development)`,
);
console.log(`  Data:    ${path.relative(process.cwd(), config.dataDir) || config.dataDir}\n`);
