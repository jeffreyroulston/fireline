import { Suspense } from "react";
import { RunTrackerProvider } from "@/lib/runs/run-tracker";
import { WorkbenchShell } from "./workbench-shell";

export default function WorkbenchLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RunTrackerProvider>
      <Suspense fallback={null}>
        <WorkbenchShell />
      </Suspense>
      {children}
    </RunTrackerProvider>
  );
}
