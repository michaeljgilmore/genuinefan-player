import { ArrowRightIcon, ClockCounterClockwiseIcon, HeartIcon, MagnifyingGlassIcon, PlayIcon, SealCheckIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { Artwork } from "../components/Artwork";
import { LogoMark } from "../components/Brand";
import { PageHeader, Section } from "../components/Page";
import { TrackList, TrackListSkeleton } from "../components/TrackList";
import { useT } from "../i18n";
import { paths } from "../lib/routes";
import type { Track } from "../lib/types";
import { usePlayer } from "../player/player";
import { useAppearance } from "../stores/appearance";
import { useFandom } from "../stores/fandom";
import { useLibrary } from "../stores/library";

function Shortcut({ to, label, tracks, cover }: { to: string; label: string; tracks: Track[]; cover: ReactNode }) {
  const playList = usePlayer((s) => s.playList);
  const t = useT();
  return (
    <div className="group relative flex h-14 items-center gap-3 overflow-hidden rounded-[12px] bg-surface-2 pr-2 transition-colors hover:bg-surface-3 md:h-16">
      <Link to={to} className="absolute inset-0" aria-label={label} />
      <span className="pointer-events-none size-14 shrink-0 overflow-hidden md:size-16">{cover}</span>
      <span className="pointer-events-none min-w-0 flex-1 truncate text-[13px] font-semibold md:text-sm">{label}</span>
      {tracks.length > 0 && (
        <button
          type="button"
          onClick={() => playList(tracks, 0)}
          aria-label={t.common.playX(label)}
          className="relative z-10 hidden size-10 shrink-0 place-items-center rounded-full bg-accent text-accent-ink opacity-0 shadow-[0_6px_18px_rgb(0_0_0/0.35)] transition-[opacity,transform] duration-200 ease-out-expo group-hover:opacity-100 hover:scale-105 active:scale-95 md:grid"
        >
          <PlayIcon size={18} weight="fill" />
        </button>
      )}
    </div>
  );
}

function RecentCard({ track, onPlay }: { track: Track; onPlay: () => void }) {
  return (
    <button type="button" onClick={onPlay} className="group flex w-36 shrink-0 snap-start flex-col gap-2 text-left md:w-44">
      <span className="relative block">
        <Artwork src={track.art} fallback={track.thumb} className="aspect-square w-full rounded-[14px]" />
        <span className="absolute right-2 bottom-2 grid size-11 translate-y-1 place-items-center rounded-full bg-accent text-accent-ink opacity-0 shadow-[0_8px_20px_rgb(0_0_0/0.4)] transition-[opacity,transform] duration-200 ease-out-expo group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:opacity-100">
          <PlayIcon size={20} weight="fill" />
        </span>
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{track.title}</span>
        <span className="block truncate text-xs text-fg-2">{track.artist}</span>
      </span>
    </button>
  );
}

/** GenuineFan's pitch on the home page: your listening is your proof, with a snapshot of your top fandom. */
function FandomHero() {
  const t = useT();
  const f = t.fandom;
  const state = useFandom((s) => s.state);
  const top = state?.report.artists.slice(0, 3) ?? [];
  const on = !!state?.consent.recording;
  return (
    <Link
      to={paths.fandom}
      className="gf-hero group mx-4 flex flex-col gap-4 rounded-[24px] p-5 ring-1 ring-line transition-transform active:scale-[0.99] md:mx-6 md:flex-row md:items-center md:p-7"
    >
      <LogoMark className="size-16 shrink-0 md:size-20" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-bold tracking-[0.2em] text-accent-text uppercase">{f.eyebrow}</p>
        <p className="mt-1 text-2xl font-extrabold tracking-tight md:text-3xl">{f.heroTitle}</p>
        {on && top.length > 0 ? (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {top.map((a) => (
              <li key={a.artistKey} className="flex items-center gap-1 rounded-full bg-surface-1/70 px-3 py-1 text-xs font-semibold ring-1 ring-line">
                <SealCheckIcon size={13} weight="fill" className="text-accent-text" />
                {f.topLine(a.artistName, f.tiers[a.tier], a.score)}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 max-w-[60ch] text-sm text-fg-2">{on ? f.heroBodyOn : f.heroBody}</p>
        )}
      </div>
      <span className="flex h-11 shrink-0 items-center gap-2 self-start rounded-full gf-gradient px-5 text-sm font-semibold md:self-center">
        {on ? f.heroCta : f.enable} <ArrowRightIcon size={16} weight="bold" className="transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}

export default function Home() {
  const { favorites, playlists, history, status } = useLibrary();
  const playList = usePlayer((s) => s.playList);
  const navigate = useNavigate();
  const t = useT();
  const show = useAppearance();
  const empty = status === "ready" && !favorites.length && !playlists.length && !history.length;

  return (
    <div className="pb-8">
      <PageHeader />

      <div className="px-4 pt-2 pb-6 md:px-6 md:pt-8">
        <h1 className="text-[28px] leading-tight font-extrabold tracking-tight md:text-4xl">{t.time.greeting(new Date().getHours())}</h1>
      </div>

      <div className="pb-8">
        <FandomHero />
      </div>

      {status === "loading" && <TrackListSkeleton rows={6} />}

      {empty && (
        <div className="mx-4 flex flex-col items-start gap-5 rounded-[20px] bg-surface-2 p-6 ring-1 ring-line md:mx-6 md:flex-row md:items-center md:p-8">
          <span className="grid size-16 shrink-0 place-items-center rounded-[18px] bg-surface-3">
            <MagnifyingGlassIcon size={30} weight="bold" className="text-accent-text" />
          </span>
          <div className="flex-1">
            <p className="text-xl font-semibold tracking-tight">{t.home.startTitle}</p>
            <p className="mt-1 max-w-[52ch] text-sm text-fg-2">{t.home.startBody}</p>
          </div>
          <button
            type="button"
            onClick={() => navigate(paths.search)}
            className="flex h-12 items-center gap-2 rounded-full bg-accent pr-6 pl-5 font-semibold text-accent-ink transition-transform active:scale-[0.97]"
          >
            <MagnifyingGlassIcon size={20} weight="bold" /> {t.common.searchMusic}
          </button>
        </div>
      )}

      {!empty && status === "ready" && (
        <div className="flex flex-col gap-10">
          {show.homeShortcuts && <div className="grid grid-cols-2 gap-2 px-4 md:px-6 lg:grid-cols-3 2xl:grid-cols-4">
            <Shortcut
              to={paths.favorites}
              label={t.nav.favorites}
              tracks={favorites}
              cover={
                <span className="grid size-full place-items-center bg-accent-soft text-accent-text">
                  <HeartIcon size={24} weight="fill" />
                </span>
              }
            />
            <Shortcut
              to={paths.history}
              label={t.nav.recentlyPlayed}
              tracks={history}
              cover={
                <span className="grid size-full place-items-center bg-surface-3 text-fg-2">
                  <ClockCounterClockwiseIcon size={24} />
                </span>
              }
            />
            {playlists.slice(0, 6).map((p) => (
              <Shortcut
                key={p.id}
                to={paths.playlist(p.id)}
                label={p.name}
                tracks={p.tracks}
                cover={<Artwork src={p.tracks[0]?.thumb} className="size-full" />}
              />
            ))}
          </div>}

          {show.homeRecent && history.length > 0 && (
            <Section
              title={t.nav.recentlyPlayed}
              action={
                <Link to={paths.history} className="text-sm font-medium text-fg-2 hover:text-fg">
                  {t.home.seeAll}
                </Link>
              }
            >
              <div className="no-scrollbar flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 md:scroll-px-6 md:px-6">
                {history.slice(0, 16).map((t, i) => (
                  <RecentCard key={t.id} track={t} onPlay={() => playList(history, i)} />
                ))}
              </div>
            </Section>
          )}

          {show.homeFavorites && favorites.length > 0 && (
            <Section
              title={t.home.yourFavorites}
              action={
                <Link to={paths.favorites} className="text-sm font-medium text-fg-2 hover:text-fg">
                  {t.home.seeAll}
                </Link>
              }
            >
              <div className="px-2 md:px-3">
                <TrackList tracks={favorites.slice(0, 5)} context={favorites} header={false} showAlbum={false} />
              </div>
            </Section>
          )}
        </div>
      )}
    </div>
  );
}
