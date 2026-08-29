import Link from "next/link";
import { buttonVariants } from "@/lib/utils/variants";
import { cn } from "@/lib/utils/cn";

export default function WorkbenchNotFound() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-[1440px] px-[clamp(18px,4vw,62px)] pb-7 max-[620px]:px-3.5">
      <section
        className={cn(
          "relative grid max-w-[560px] gap-4 rounded-2xl border border-border bg-surface/90 p-7",
          "min-h-[540px] py-7 pb-9",
        )}
      >
        <h1 className="m-0 font-display text-[28px] tracking-[0.04em]">Page not found</h1>
        <p className="m-0 text-muted leading-normal">
          That workbench mode or deck URL does not exist. Pick a calculator from the home
          screen.
        </p>
        <Link className={buttonVariants({ intent: "primary" })} href="/hand">
          Open hand solver
        </Link>
      </section>
    </main>
  );
}
