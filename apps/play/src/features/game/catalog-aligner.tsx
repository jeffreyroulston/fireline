"use client";

import { useEffect, useState, type ReactNode } from "react";
import { alignCatalogWithEngine } from "@ga-fire/game";
import { fetchCatalogCards, fetchEngineVersion } from "@/lib/api/playtest";

/**
 * On boot, compare live engine `cardDigest` to the image bundle. On mismatch,
 * hydrate display catalog from GET /cards so play UI tracks the worker.
 */
export function CatalogAligner({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [version, cards] = await Promise.all([
          fetchEngineVersion(),
          fetchCatalogCards(),
        ]);
        if (!cancelled) {
          alignCatalogWithEngine({
            engineCardDigest: version.cardDigest,
            cards,
          });
        }
      } catch {
        // Keep the bundled catalog when the API is unreachable.
      } finally {
        if (!cancelled) {
          setReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) {
    return null;
  }
  return children;
}
