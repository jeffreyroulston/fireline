"use client";

import { notFound, usePathname } from "next/navigation";
import FizaWorkbench from "@/features/workbench";
import { parseWorkbenchPath } from "@/features/workbench/routes";

export function WorkbenchShell() {
  const pathname = usePathname();
  const { tab, deckId } = parseWorkbenchPath(pathname);

  if (!tab) {
    notFound();
  }

  return <FizaWorkbench tab={tab} deckId={deckId} />;
}
