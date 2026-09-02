import { notFound } from "next/navigation";
import { tabFromPath } from "@/features/workbench/routes";

export default async function WorkbenchPage({
  params,
}: {
  params: Promise<{ mode: string; deckId?: string[] }>;
}) {
  const { mode } = await params;
  if (mode !== "prototype" && !tabFromPath(mode)) {
    notFound();
  }

  // Real HTMLElement so App Router scroll/focus can target the top of the
  // workbench. Returning null made navigations keep the previous scroll offset
  // (clamped to the bottom once the new tab's document height settled).
  return (
    <div
      id="workbench-top"
      tabIndex={-1}
      aria-hidden="true"
      className="pointer-events-none h-0 w-0 overflow-hidden outline-none"
    />
  );
}
