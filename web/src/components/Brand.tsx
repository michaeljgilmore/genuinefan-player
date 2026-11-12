import mark from "../assets/genuinefan-mark.png";
import { cn } from "../lib/format";

/** The GenuineFan mark (the ticket-in-hand starburst from genuine-fan/public), used as-is. */
export function LogoMark({ className }: { className?: string }) {
  return <img src={mark} alt="" aria-hidden="true" draggable={false} className={cn("select-none object-contain", className)} />;
}

/** "GenuineFan" in the brand wordmark gradient (genuine-fan --brand-wordmark-gradient), then "Player". */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark className="size-8" />
      <span className="flex flex-col leading-none">
        <span className="gf-wordmark text-[17px] font-extrabold tracking-tight">GenuineFan</span>
        <span className="mt-0.5 text-[11px] font-semibold tracking-[0.18em] text-fg-3 uppercase">Player</span>
      </span>
    </span>
  );
}

/** The playing-track marker: three bars bouncing. */
export function Equalizer({ live, className }: { live: boolean; className?: string }) {
  return (
    <span aria-hidden="true" className={cn("inline-flex h-3.5 items-end gap-[2px]", live && "eq-live", className)}>
      <span className="eq-bar h-full w-[3px] rounded-full bg-accent-text" />
      <span className="eq-bar h-full w-[3px] rounded-full bg-accent-text" />
      <span className="eq-bar h-full w-[3px] rounded-full bg-accent-text" />
    </span>
  );
}
