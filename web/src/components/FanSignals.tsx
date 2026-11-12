import {
  ArrowsClockwiseIcon,
  EyeIcon,
  LinkBreakIcon,
  LinkIcon,
  SealCheckIcon,
  ShieldCheckIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { useT } from "../i18n";
import type { FandomTier } from "../lib/api";
import { cn } from "../lib/format";
import { useFandom } from "../stores/fandom";

/** A labelled on/off switch. */
export function Toggle({
  label,
  body,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  body?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-3", disabled && "cursor-not-allowed opacity-55")}>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-fg">{label}</span>
        {body && <span className="mt-0.5 block text-xs text-fg-2">{body}</span>}
      </span>
      <input
        type="checkbox"
        role="switch"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        aria-hidden="true"
        className={cn(
          "relative mt-0.5 h-6 w-10 shrink-0 rounded-full transition-colors duration-200 peer-focus-visible:outline-2 peer-focus-visible:outline-accent",
          checked ? "gf-gradient" : "bg-surface-4",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform duration-200 ease-out-expo",
            checked && "translate-x-4",
          )}
        />
      </span>
    </label>
  );
}

const TIER_STYLE: Record<FandomTier, string> = {
  listener: "bg-surface-3 text-fg-2",
  fan: "bg-accent-soft text-accent-text",
  genuine: "gf-gradient",
  vip: "gf-gradient ring-2 ring-[#f5b93b] ring-offset-2 ring-offset-surface-2",
};

export function TierBadge({ tier, className }: { tier: FandomTier; className?: string }) {
  const t = useT();
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold", TIER_STYLE[tier], className)}>
      {(tier === "genuine" || tier === "vip") && <SealCheckIcon size={14} weight="fill" />}
      {t.fandom.tiers[tier]}
    </span>
  );
}

export function ScoreRing({ score, size = 64 }: { score: number; size?: number }) {
  return (
    <span
      className="gf-ring grid shrink-0 place-items-center rounded-full"
      style={{ ["--p" as string]: score, width: size, height: size }}
      role="img"
      aria-label={`${score} / 100`}
    >
      <span className="grid place-items-center rounded-full bg-surface-2" style={{ width: size - 10, height: size - 10 }}>
        <span className="text-lg font-extrabold tabular-nums" style={{ fontSize: size / 3.4 }}>
          {score}
        </span>
      </span>
    </span>
  );
}

function relative(at: number, locale: string) {
  const sec = Math.round((at - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (Math.abs(sec) < 60) return rtf.format(sec, "second");
  if (Math.abs(sec) < 3600) return rtf.format(Math.round(sec / 60), "minute");
  if (Math.abs(sec) < 86400) return rtf.format(Math.round(sec / 3600), "hour");
  return rtf.format(Math.round(sec / 86400), "day");
}

/** Link to GenuineFan, sharing switch, Sync now and the payload preview. Used on Your Fandom. */
export function LinkPanel() {
  const t = useT();
  const { state, busy, preview, link, unlink, setConsent, sync, loadPreview } = useFandom();
  const [showPreview, setShowPreview] = useState(false);
  if (!state) return null;
  const f = t.fandom;
  const { link: l, consent, sync: s } = state;

  return (
    <div className="flex flex-col gap-4 rounded-[20px] bg-surface-2 p-5 ring-1 ring-line">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full gf-gradient">
          <ShieldCheckIcon size={20} weight="fill" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold tracking-tight">{f.linkTitle}</p>
          <p className="text-sm text-fg-2">
            {l.status === "linked" ? f.linkLinked(l.account) : l.status === "pending" ? f.linkPending : f.linkNone}
          </p>
          {l.deviceId && <p className="mt-1 font-mono text-[11px] text-fg-3">{l.deviceId}</p>}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {l.status !== "linked" && (
          <button
            type="button"
            disabled={busy || !consent.recording}
            onClick={() => void link()}
            className="flex h-10 items-center gap-2 rounded-full gf-gradient px-5 text-sm font-semibold transition-transform active:scale-[0.97] disabled:opacity-50"
          >
            <LinkIcon size={16} weight="bold" /> {l.status === "pending" ? f.relink : f.link}
          </button>
        )}
        {l.status !== "none" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void unlink()}
            className="flex h-10 items-center gap-2 rounded-full bg-surface-3 px-4 text-sm font-medium text-fg-2 hover:text-fg disabled:opacity-50"
          >
            <LinkBreakIcon size={16} /> {f.unlink}
          </button>
        )}
      </div>

      <Toggle
        label={f.share}
        body={f.shareBody}
        checked={consent.sharing}
        disabled={busy || !consent.recording || l.status === "none"}
        onChange={(on) => void setConsent({ sharing: on })}
      />

      {!s.endpointConfigured && <p className="rounded-[12px] bg-surface-1 p-3 text-xs text-fg-2 ring-1 ring-line">{f.noEndpoint}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy || !consent.sharing}
          onClick={() => void sync()}
          className="flex h-10 items-center gap-2 rounded-full bg-accent px-5 text-sm font-semibold text-accent-ink disabled:opacity-50"
        >
          <ArrowsClockwiseIcon size={16} weight="bold" className={cn(busy && "animate-spin")} /> {f.syncNow}
        </button>
        <button
          type="button"
          onClick={() => {
            if (!showPreview) void loadPreview();
            setShowPreview(!showPreview);
          }}
          className="flex h-10 items-center gap-2 rounded-full bg-surface-3 px-4 text-sm font-medium text-fg-2 hover:text-fg"
        >
          <EyeIcon size={16} /> {showPreview ? f.hidePreview : f.preview}
        </button>
        {s.lastSync && (
          <span className={cn("text-xs", s.lastSync.ok ? "text-fg-3" : "text-danger")}>
            {f.lastSync(relative(s.lastSync.at, t.locale), s.lastSync.ok)}
            {!s.lastSync.ok && ` (${s.lastSync.message})`}
          </span>
        )}
      </div>

      {showPreview && preview && (
        <pre className="scroll-area max-h-72 overflow-auto rounded-[12px] bg-bg p-3 font-mono text-[11px] leading-relaxed text-fg-2 ring-1 ring-line">
          {JSON.stringify(preview, null, 2)}
        </pre>
      )}
    </div>
  );
}

/** Settings > Fan Signals: consent, what's stored, clear history. */
export function FanSignalsSettings({ onOpenFandom }: { onOpenFandom: () => void }) {
  const t = useT();
  const { state, busy, setConsent, clear } = useFandom();
  const f = t.fandom;
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-medium text-fg-3">{f.settingsTitle}</h3>
      <div className="flex flex-col gap-4 rounded-[16px] bg-surface-1 p-4 ring-1 ring-line">
        {state && !state.allowed && <p className="text-sm text-danger">{f.disabledByOperator}</p>}
        <Toggle
          label={f.record}
          body={f.recordBody}
          checked={!!state?.consent.recording}
          disabled={busy || !state || !state.allowed}
          onChange={(on) => void setConsent({ recording: on })}
        />
        <Toggle
          label={f.share}
          body={f.shareBody}
          checked={!!state?.consent.sharing}
          disabled={busy || !state?.consent.recording || state.link.status === "none"}
          onChange={(on) => void setConsent({ sharing: on })}
        />
        <p className="text-xs text-fg-3">{f.events(state?.events ?? 0)}</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onOpenFandom}
            className="flex h-10 items-center gap-2 rounded-full bg-surface-3 px-4 text-sm font-medium text-fg hover:bg-surface-4"
          >
            <SealCheckIcon size={16} weight="fill" className="text-accent-text" /> {f.open}
          </button>
          <button
            type="button"
            disabled={busy || !state?.events}
            onClick={() => {
              if (window.confirm(f.clearConfirm)) void clear();
            }}
            className="flex h-10 items-center gap-2 rounded-full bg-danger/12 px-4 text-sm font-medium text-danger disabled:opacity-50"
          >
            <TrashIcon size={16} /> {f.clear}
          </button>
        </div>
      </div>
    </section>
  );
}
