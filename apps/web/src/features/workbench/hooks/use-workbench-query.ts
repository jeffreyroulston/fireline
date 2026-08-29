"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cleanQueryForTab } from "../routes";
import type { Tab } from "../types";

export function useWorkbenchQuery(tab: Tab) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  const replaceQuery = useCallback(
    (buildNext: (current: URLSearchParams) => URLSearchParams) => {
      const next = cleanQueryForTab(
        tab,
        buildNext(new URLSearchParams(searchParams.toString())),
      );
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams, tab],
  );

  const pushQuery = useCallback(
    (buildNext: (current: URLSearchParams) => URLSearchParams) => {
      const next = cleanQueryForTab(
        tab,
        buildNext(new URLSearchParams(searchParams.toString())),
      );
      const qs = next.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams, tab],
  );

  return { searchParams, replaceQuery, pushQuery };
}
