import type { ReactNode } from "react";
import { loadWorkbenchBootstrapData } from "./workbench-bootstrap-data";
import { WorkbenchProviders } from "./workbench-providers";

export async function WorkbenchBootstrap({
  children,
}: {
  children: ReactNode;
}) {
  const data = await loadWorkbenchBootstrapData();

  return (
    <WorkbenchProviders
      initialDecks={data.decks}
      initialMaterialDecks={data.materialDecks}
      initialCatalog={data.catalog}
      initialWorkerVersion={data.workerVersion}
    >
      {children}
    </WorkbenchProviders>
  );
}
