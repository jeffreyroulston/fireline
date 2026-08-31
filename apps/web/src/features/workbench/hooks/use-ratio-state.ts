"use client";

import { useEffect, useState } from "react";
import {
  MAX_RATIO_DECK_ATTEMPTS,
  MIN_VALID_DECK_SIZE,
  countLegalDecklists,
  deckAttemptPercent,
  listToCounts,
  parseDecklist,
  type CardId,
  type DeckCounts,
} from "@/lib/engine";
import { snapshotRatioCriteria } from "../panels/ratios";
import type { RatioRefineCriteria, RatioStrategy } from "../types";
import { refineBounds, REFINE_COPY_CEILING } from "../utils";

type UseRatioStateOptions = Readonly<{
  deckText: string;
  activeDeckId: string;
  decksHydrated: boolean;
}>;

export type RatioStateSnapshot = Readonly<{
  cutBudgets: Partial<Record<CardId, number>>;
  replacements: Partial<Record<CardId, number>>;
  ratioSamples: number;
  metric: "mean" | "p50";
  ratioStrategy: RatioStrategy;
  swapFrom: CardId | "";
  swapCount: number;
  swapCandidates: Partial<Record<CardId, boolean>>;
  ratioCriteria: RatioRefineCriteria | null;
  ratioBaseCounts: DeckCounts;
  ratioRecognizedCount: number;
  deckSize: number;
  bounds: ReturnType<typeof refineBounds>;
  boundMinTotal: number;
  boundMaxTotal: number;
  freeCopies: number;
  legalDecklists: bigint;
  attemptCeiling: number;
  coveragePercent: number;
  replacementCount: number;
}>;

export type RatioStateActions = Readonly<{
  setCutBudget: (id: CardId, cutUpTo: number) => void;
  toggleReplacement: (id: CardId) => void;
  setReplacementMax: (id: CardId, max: number) => void;
  toggleSwapCandidate: (id: CardId) => void;
  setRatioSamples: (value: number) => void;
  setMetric: (value: "mean" | "p50") => void;
  setRatioStrategy: (value: RatioStrategy) => void;
  setSwapFrom: (value: CardId | "") => void;
  setSwapCount: (value: number) => void;
  setRatioCriteria: (value: RatioRefineCriteria | null) => void;
  snapshotCriteria: (baseDeckName: string) => RatioRefineCriteria;
}>;

export type UseRatioStateResult = RatioStateSnapshot & RatioStateActions;

export function useRatioState({
  deckText,
  activeDeckId,
  decksHydrated,
}: UseRatioStateOptions): UseRatioStateResult {
  const [cutBudgets, setCutBudgets] = useState<
    Partial<Record<CardId, number>>
  >({});
  const [replacements, setReplacements] = useState<
    Partial<Record<CardId, number>>
  >({});
  const [ratioSamples, setRatioSamples] = useState(40);
  const [metric, setMetric] = useState<"mean" | "p50">("mean");
  const [ratioStrategy, setRatioStrategy] =
    useState<RatioStrategy>("randomSample");
  const [swapFrom, setSwapFrom] = useState<CardId | "">("");
  const [swapCount, setSwapCount] = useState(1);
  const [swapCandidates, setSwapCandidates] = useState<
    Partial<Record<CardId, boolean>>
  >({});
  const [ratioCriteria, setRatioCriteria] =
    useState<RatioRefineCriteria | null>(null);

  const ratioBaseCards = parseDecklist(deckText);
  const ratioRecognizedCount = ratioBaseCards.length;
  const ratioBaseCounts = listToCounts(ratioBaseCards);
  const deckSize = MIN_VALID_DECK_SIZE;
  const bounds = refineBounds(ratioBaseCounts, cutBudgets, replacements);
  const boundMinTotal = Object.values(bounds).reduce(
    (sum, item) => sum + item.min,
    0,
  );
  const boundMaxTotal = Object.values(bounds).reduce(
    (sum, item) => sum + item.max,
    0,
  );
  const freeCopies = Math.max(0, deckSize - boundMinTotal);
  const legalDecklists = countLegalDecklists(bounds, deckSize);
  const attemptCeiling =
    legalDecklists === BigInt(0)
      ? 0
      : Number(
          legalDecklists < BigInt(MAX_RATIO_DECK_ATTEMPTS)
            ? legalDecklists
            : BigInt(MAX_RATIO_DECK_ATTEMPTS),
        );
  const coveragePercent = deckAttemptPercent(attemptCeiling, legalDecklists);
  const replacementCount = Object.keys(replacements).length;

  useEffect(() => {
    setSwapCandidates((current) => {
      let changed = false;
      const next = { ...current };
      for (const id of Object.keys(next) as CardId[]) {
        if (id === swapFrom || (ratioBaseCounts[id] ?? 0) > 0) {
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [ratioBaseCounts, swapFrom]);

  useEffect(() => {
    if (!decksHydrated) {
      return;
    }
    setRatioCriteria(null);
    setCutBudgets({});
    setReplacements({});
  }, [activeDeckId, decksHydrated]);

  useEffect(() => {
    const counts = listToCounts(parseDecklist(deckText));
    setReplacements((current) => {
      const nextEntries = Object.entries(current).filter(
        ([id]) => (counts[id as CardId] ?? 0) < REFINE_COPY_CEILING,
      );
      if (nextEntries.length === Object.keys(current).length) {
        return current;
      }
      return Object.fromEntries(nextEntries) as Partial<Record<CardId, number>>;
    });
  }, [deckText]);

  function setCutBudget(id: CardId, cutUpTo: number) {
    setCutBudgets((current) => {
      const count = ratioBaseCounts[id] ?? 0;
      const nextCut = Math.min(count, Math.max(0, cutUpTo));
      if (nextCut <= 0) {
        const rest = { ...current };
        delete rest[id];
        return rest;
      }
      return { ...current, [id]: nextCut };
    });
  }

  function toggleReplacement(id: CardId) {
    if ((ratioBaseCounts[id] ?? 0) >= REFINE_COPY_CEILING) {
      return;
    }
    setReplacements((current) => {
      if (current[id] != null) {
        const rest = { ...current };
        delete rest[id];
        return rest;
      }
      return { ...current, [id]: REFINE_COPY_CEILING };
    });
  }

  function setReplacementMax(id: CardId, max: number) {
    setReplacements((current) => {
      if (current[id] == null) {
        return current;
      }
      const nextMax = Math.min(REFINE_COPY_CEILING, Math.max(1, max));
      return { ...current, [id]: nextMax };
    });
  }

  function toggleSwapCandidate(id: CardId) {
    setSwapCandidates((current) => {
      if (current[id]) {
        const rest = { ...current };
        delete rest[id];
        return rest;
      }
      return { ...current, [id]: true };
    });
  }

  function snapshotCriteria(baseDeckName: string): RatioRefineCriteria {
    return snapshotRatioCriteria(
      baseDeckName,
      ratioBaseCounts,
      cutBudgets,
      replacements,
    );
  }

  return {
    cutBudgets,
    replacements,
    ratioSamples,
    metric,
    ratioStrategy,
    swapFrom,
    swapCount,
    swapCandidates,
    ratioCriteria,
    ratioBaseCounts,
    ratioRecognizedCount,
    deckSize,
    bounds,
    boundMinTotal,
    boundMaxTotal,
    freeCopies,
    legalDecklists,
    attemptCeiling,
    coveragePercent,
    replacementCount,
    setCutBudget,
    toggleReplacement,
    setReplacementMax,
    toggleSwapCandidate,
    setRatioSamples,
    setMetric,
    setRatioStrategy,
    setSwapFrom,
    setSwapCount,
    setRatioCriteria,
    snapshotCriteria,
  };
}
