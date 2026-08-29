import Link from "next/link";
import { WorkerStatusNav } from "@/components/worker-status-nav";
import type { WorkerVersion } from "@/lib/api/shared";
import { navTabVariants } from "@/lib/utils/variants";
import { workbenchHref } from "../routes";
import type { Tab } from "../types";

const TAB_LABELS: Array<[Tab, string]> = [
  ["line", "Hand solver"],
  ["manage", "Decks"],
  ["deck", "Deck damage"],
  ["ratios", "Ratio lab"],
  ["cards", "Card database"],
  ["history", "History"],
  ["info", "Information"],
];

export function WorkbenchChrome({
  tab,
  activeDeckId,
  workerVersion,
  onTabClick,
  children,
}: {
  tab: Tab;
  activeDeckId: string;
  workerVersion: WorkerVersion | null;
  onTabClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto min-h-screen w-full max-w-[1440px] px-[clamp(18px,4vw,62px)] pb-7 max-[620px]:px-3.5">
      <header className="flex min-h-[84px] items-center justify-between border-b border-border">
        <div className="flex items-center gap-3" aria-label="Fireline Grand Archive math">
          <span className="grid h-12 w-10 skew-x-[-7deg] place-items-center bg-primary font-display text-[32px] font-bold text-white">
            F
          </span>
          <div>
            <p className="m-0 font-mono text-[10px] uppercase tracking-[0.13em] text-muted">
              Grand Archive math
            </p>
            <h1 className="m-0 font-display text-[30px] leading-[0.9] tracking-[0.06em]">
              FIRELINE
            </h1>
          </div>
        </div>
        <div className="flex gap-2.5 font-mono text-[11px] uppercase text-muted max-[620px]:hidden">
          <WorkerStatusNav activeDeckId={activeDeckId || undefined} />
        </div>
      </header>

      <nav
        className="flex gap-0 border-b border-foreground max-[620px]:overflow-x-auto"
        aria-label="Calculator modes"
      >
        {TAB_LABELS.map(([id, label]) => (
          <Link
            className={navTabVariants({ active: tab === id })}
            href={workbenchHref(id, activeDeckId || undefined)}
            key={id}
            onClick={onTabClick}
          >
            {label}
          </Link>
        ))}
      </nav>

      {children}

      <footer className="flex justify-between gap-5 border-t border-border pt-5 font-mono text-[9px] uppercase text-muted max-[620px]:flex-col">
        <span>
          {workerVersion
            ? `r${workerVersion.rules} · s${workerVersion.sampler} · a${workerVersion.attribution} · digest ${String(workerVersion.cardDigest).slice(0, 8)} · ${workerVersion.build}`
            : "—"}
        </span>
      </footer>
    </main>
  );
}
