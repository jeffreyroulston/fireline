import { Suspense } from "react";
import { WorkbenchLoader } from "@/features/workbench/ui/workbench-loader";
import { WorkbenchBootstrap } from "@/features/workbench/workbench-bootstrap";
import { WorkbenchShell } from "./workbench-shell";

export default async function WorkbenchLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <WorkbenchBootstrap>
      {/* Page slot first: Next scroll/focus targets this segment on soft nav. */}
      {children}
      <Suspense fallback={<WorkbenchLoader />}>
        <WorkbenchShell />
      </Suspense>
    </WorkbenchBootstrap>
  );
}
