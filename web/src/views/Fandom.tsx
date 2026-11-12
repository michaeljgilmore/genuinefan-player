import { FireIcon, HeadphonesIcon, MicrophoneStageIcon, PlayCircleIcon, SealCheckIcon, WarningIcon } from "@phosphor-icons/react";
import { useEffect, type ReactNode } from "react";
import { LogoMark } from "../components/Brand";
import { LinkPanel, ScoreRing, TierBadge } from "../components/FanSignals";
import { PageHeader, Section } from "../components/Page";
import { TrackListSkeleton } from "../components/TrackList";
import { useT } from "../i18n";
import type { ArtistFandom, FandomTier } from "../lib/api";
import { cn } from "../lib/format";
import { useFandom } from "../stores/fandom";

/** Component maxima (server/src/fanSignals.ts COMPONENTS). */
const MAX = { plays: 20, completion: 20, depth: 15, consistency: 15, streak: 10, repeats: 5, saves: 10, searches: 5 } as const;
const NEXT: Record<FandomTier, [FandomTier, number] | null> = { listener: ["fan", 25], fan: ["genuine", 70], genuine: ["vip", 85], vip: null };

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-[16px] bg-surface-2/80 p-3 ring-1 ring-line backdrop-blur">
      <span className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-surface-3 text-accent-text">{icon}</span>
      <span className="min-w-0">
        <span className="block text-lg leading-tight font-extrabold tabular-nums">{value}</span>
        <span className="block truncate text-xs text-fg-2">{label}</span>
      </span>
    </div>
  );
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

function ArtistCard({ a, rank }: { a: ArtistFandom; rank: number }) {
  const t = useT();
  const f = t.fandom;
  const next = NEXT[a.tier];
  const plays = a.verified.qualifiedPlays + a.unverified.qualifiedPlays;
  return (
    <article className="flex flex-col gap-4 rounded-[20px] bg-surface-2 p-5 ring-1 ring-line">
      <div className="flex items-center gap-4">
        <span className="relative grid size-14 shrink-0 place-items-center rounded-full gf-gradient text-lg font-extrabold">
          {initials(a.artistName)}
          <span className="absolute -top-1 -left-1 grid size-6 place-items-center rounded-full bg-surface-1 text-[11px] font-bold text-fg-2 ring-1 ring-line">
            {rank}
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-bold tracking-tight">{a.artistName}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <TierBadge tier={a.tier} />
            <span className="text-xs text-fg-3">
              {t.common.tracks(a.verified.distinctTracks + a.unverified.distinctTracks)} · {f.plays.toLowerCase()} {plays}
            </span>
          </div>
        </div>
        <ScoreRing score={a.score} />
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        {(Object.keys(MAX) as (keyof typeof MAX)[]).map((k) => (
          <div key={k}>
            <dt className="flex justify-between text-[11px] text-fg-3">
              <span>{f.components[k]}</span>
              <span className="tabular-nums">
                {Math.round(a.breakdown[k])}/{MAX[k]}
              </span>
            </dt>
            <dd className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-4">
              <span className="block h-full rounded-full gf-gradient" style={{ width: `${(a.breakdown[k] / MAX[k]) * 100}%` }} />
            </dd>
          </div>
        ))}
      </dl>

      {(a.badges.length > 0 || next) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {a.badges.map((b) => (
            <span key={b} className="inline-flex items-center gap-1 rounded-full bg-surface-3 px-2.5 py-1 text-[11px] font-semibold text-fg">
              <SealCheckIcon size={12} weight="fill" className="text-accent-text" /> {f.badges[b]}
            </span>
          ))}
          {next && <span className="ml-auto text-[11px] text-fg-3">{f.nextTier(Math.max(1, next[1] - a.score), f.tiers[next[0]])}</span>}
        </div>
      )}

      {a.flags.length > 0 && (
        <ul className="flex flex-col gap-1">
          {a.flags.map((fl) => (
            <li key={fl} className={cn("flex items-center gap-1.5 text-[11px]", fl === "unverified_plays" ? "text-fg-3" : "text-danger")}>
              <WarningIcon size={12} /> {f.flags[fl]}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

export default function Fandom() {
  const t = useT();
  const f = t.fandom;
  const { status, state, load, setConsent, busy } = useFandom();

  useEffect(() => {
    void load();
  }, [load]);

  const report = state?.report;
  const on = !!state?.consent.recording;
  const anyUnverified = !!report?.artists.some((a) => a.flags.includes("unverified_plays"));

  return (
    <div className="pb-10">
      <PageHeader mobileOnly />

      <div className="gf-hero mx-0 px-4 pt-8 pb-8 md:mx-3 md:mt-3 md:rounded-[24px] md:px-8 md:pt-10">
        <div className="flex items-start gap-4">
          <LogoMark className="hidden size-16 shrink-0 md:block" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold tracking-[0.2em] text-accent-text uppercase">{f.eyebrow}</p>
            <h1 className="mt-1 text-[32px] leading-tight font-extrabold tracking-tight md:text-5xl">{f.title}</h1>
            <p className="mt-2 text-lg font-semibold gf-wordmark">{f.tagline}</p>
            <p className="mt-3 max-w-[62ch] text-sm text-fg-2">{on ? f.introOn : f.intro}</p>
          </div>
        </div>

        {state && !on && (
          <div className="mt-6 flex flex-col items-start gap-3 md:flex-row md:items-center">
            <button
              type="button"
              disabled={busy || !state.allowed}
              onClick={() => void setConsent({ recording: true })}
              className="flex h-12 items-center gap-2 rounded-full gf-gradient px-6 font-semibold shadow-[0_10px_30px_rgb(109_63_208/0.4)] transition-transform active:scale-[0.97] disabled:opacity-50"
            >
              <SealCheckIcon size={20} weight="fill" /> {f.enable}
            </button>
            <p className="max-w-[56ch] text-xs text-fg-3">{state.allowed ? f.privacyNote : f.disabledByOperator}</p>
          </div>
        )}

        {report && (
          <div className="mt-6 grid grid-cols-2 gap-2 lg:grid-cols-4">
            <Stat icon={<FireIcon size={20} weight="fill" />} label={f.streak} value={f.days(report.summary.streakDays)} />
            <Stat icon={<HeadphonesIcon size={20} weight="fill" />} label={f.minutes} value={String(Math.round(report.summary.listenedSec / 60))} />
            <Stat icon={<MicrophoneStageIcon size={20} weight="fill" />} label={f.artists} value={String(report.summary.artists)} />
            <Stat icon={<PlayCircleIcon size={20} weight="fill" />} label={f.plays} value={String(report.summary.qualifiedPlays)} />
          </div>
        )}
      </div>

      {status === "loading" && !state && <TrackListSkeleton rows={4} />}

      {report && (
        <div className="mt-8 flex flex-col gap-8">
          <Section title={f.topArtists} action={<span className="text-xs text-fg-3">{f.windowNote(report.windowDays)}</span>}>
            {anyUnverified && <p className="mx-4 rounded-[12px] bg-surface-2 p-3 text-xs text-fg-2 ring-1 ring-line md:mx-6">{f.unverifiedNote}</p>}
            {report.artists.length === 0 ? (
              <div className="mx-4 rounded-[20px] bg-surface-2 p-6 text-center ring-1 ring-line md:mx-6">
                <p className="font-semibold">{f.empty}</p>
                <p className="mt-1 text-sm text-fg-2">{f.emptyBody}</p>
              </div>
            ) : (
              <div className="grid gap-3 px-4 md:px-6 xl:grid-cols-2">
                {report.artists.slice(0, 12).map((a, i) => (
                  <ArtistCard key={a.artistKey} a={a} rank={i + 1} />
                ))}
              </div>
            )}
          </Section>

          <div className="px-4 md:px-6">
            <LinkPanel />
          </div>
        </div>
      )}
    </div>
  );
}
