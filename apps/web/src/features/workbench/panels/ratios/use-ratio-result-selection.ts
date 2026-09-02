"use client";

import { useEffect, useState } from "react";

export function ratioResultRowId(rank: number): string {
  return `ratio-result-rank-${rank}`;
}

export function useRatioResultSelection(resetKey: unknown) {
  const [selectedRank, setSelectedRank] = useState<number | null>(null);
  const [scrollToRank, setScrollToRank] = useState<number | null>(null);

  useEffect(() => {
    setSelectedRank(null);
    setScrollToRank(null);
  }, [resetKey]);

  useEffect(() => {
    if (scrollToRank == null || selectedRank != null) {
      return;
    }

    const rank = scrollToRank;
    requestAnimationFrame(() => {
      document
        .getElementById(ratioResultRowId(rank))
        ?.scrollIntoView({ block: "nearest", behavior: "instant" });
      setScrollToRank(null);
    });
  }, [scrollToRank, selectedRank]);

  return {
    selectedRank,
    selectRank: setSelectedRank,
    returnToList: () => {
      setSelectedRank((rank) => {
        if (rank != null) {
          setScrollToRank(rank);
        }
        return null;
      });
    },
  };
}
