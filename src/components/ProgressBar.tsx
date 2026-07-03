"use client";

/**
 * Slim overall-progress bar for the processing screen. Takes a 0..1 value and
 * animates the fill, with a sheen sweeping across so it never looks frozen even
 * while a single step sits working for a while.
 */
export function ProgressBar({
  value,
  label = "Overall progress",
}: {
  value: number;
  label?: string;
}) {
  // Floor the display so an early job still shows a sliver of motion.
  const pct = Math.max(3, Math.min(100, Math.round(value * 100)));
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[12px] font-medium">
        <span className="uppercase tracking-wide text-muted">{label}</span>
        <span className="tabular-nums text-accent">{pct}%</span>
      </div>
      <div
        className="h-2.5 w-full overflow-hidden rounded-full bg-tint"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div
          className="relative h-full rounded-full bg-accent transition-[width] duration-700 ease-out"
          style={{ width: `${pct}%` }}
        >
          <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/50 to-transparent" />
        </div>
      </div>
    </div>
  );
}
