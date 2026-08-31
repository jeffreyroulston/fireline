"use client";

import { useLayoutEffect } from "react";
import { notFound, usePathname } from "next/navigation";
import FizaWorkbench from "@/features/workbench";
import { parseWorkbenchPath } from "@/features/workbench/routes";

export function WorkbenchShell() {
  const pathname = usePathname();
  const { tab, deckId } = parseWorkbenchPath(pathname);

  // Soft tab changes keep this shell mounted while the page slot is only a
  // scroll anchor. Reset window scroll here; nav Links use scroll={false} so
  // Next doesn't fight us (or miss entirely when the page used to return null).
  useLayoutEffect(() => {
    if (!tab) return;
    window.scrollTo(0, 0);
  }, [tab]);

  if (!tab) {
    notFound();
  }

  return <FizaWorkbench tab={tab} deckId={deckId} />;
}
