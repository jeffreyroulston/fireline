import { cn } from "@/lib/utils";

function LoaderContent({ label = "Loading…" }: { label?: string }) {
  return (
    <div
      className="flex flex-col items-center gap-3"
      aria-busy="true"
      aria-label={label}
    >
      <span
        className="block h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary"
        aria-hidden
      />
      <p className="m-0 font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
        {label}
      </p>
    </div>
  );
}

/** Full-page loader for route transitions and shell bootstrap. */
export function WorkbenchLoader({ label }: { label?: string }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1440px] items-center justify-center px-[clamp(18px,4vw,62px)] pb-7 max-[620px]:px-3.5">
      <LoaderContent label={label} />
    </main>
  );
}

/** Inline loader for lazily loaded tab panels. */
export function WorkbenchPanelLoader({
  className,
  label,
}: {
  className?: string;
  label?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-[240px] w-full items-center justify-center py-12",
        className,
      )}
    >
      <LoaderContent label={label} />
    </div>
  );
}
