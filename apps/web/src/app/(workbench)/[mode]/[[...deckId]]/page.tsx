import { notFound } from "next/navigation";
import { tabFromPath } from "@/features/workbench/routes";

export default async function WorkbenchPage({
  params,
}: {
  params: Promise<{ mode: string; deckId?: string[] }>;
}) {
  const { mode } = await params;
  if (!tabFromPath(mode)) {
    notFound();
  }

  return null;
}
