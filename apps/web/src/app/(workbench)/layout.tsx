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
      <Suspense fallback={<WorkbenchLoader />}>
        <WorkbenchShell />
      </Suspense>
      {children}
    </WorkbenchBootstrap>
  );
}
