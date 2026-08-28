import { Suspense } from "react";
import { WorkbenchShell } from "./workbench-shell";

export default function WorkbenchLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Suspense fallback={null}>
        <WorkbenchShell />
      </Suspense>
      {children}
    </>
  );
}
