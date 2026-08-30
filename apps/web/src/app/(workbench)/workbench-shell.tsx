"use client";

import { useLayoutEffect } from "react";
import { notFound, usePathname } from "next/navigation";
import FizaWorkbench from "@/features/workbench";
import { parseWorkbenchPath } from "@/features/workbench/routes";

export function WorkbenchShell() {
  const pathname = usePathname();
  const { tab, deckId } = parseWorkbenchPath(pathname);

  // Tab UI lives in this layout shell while page slots stay empty, so Next's
  // default Link scroll-to-top often never runs. Swapping a short tab for a
  // tall one (ratio lab) then clamps scroll to the previous document bottom.
  useLayoutEffect(() => {
    if (!tab) return;
    window.scrollTo(0, 0);
  }, [tab]);

  if (!tab) {
    notFound();
  }

  return <FizaWorkbench tab={tab} deckId={deckId} />;
}
