"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { type SimType } from "@/lib/engine";
import { deleteRun } from "@/lib/api/client";
import type { SavedDeck } from "@/lib/decks";
import {
  useCardLeaderboardQuery,
  usePooledDamageQuery,
  usePooledSampleHighlightsQuery,
  useRunHistoryQuery,
  useVersionGroupsQuery,
} from "@/hooks/api";
import type { DamageRange } from "../lib/damage-range";
import { historyQueryPatch, parseSimParam } from "../routes";
import { useWorkbenchQuery } from "./use-workbench-query";
import { groupKey, resolvePoolHash } from "../panels/history/shared";

type HistoryPanelHookOptions = Readonly<{
  decks: SavedDeck[];
  routeDeckId?: string;
  refreshToken: number;
}>;

export function useHistoryPanel({
  decks,
  routeDeckId,
  refreshToken,
}: HistoryPanelHookOptions) {
  const { searchParams, replaceQuery } = useWorkbenchQuery("history");
  const versionGroupFromUrl = searchParams.get("vg");
  const [filterDeckId, setFilterDeckId] = useState<string | null>(
    routeDeckId ?? null,
  );

  useEffect(() => {
    if (routeDeckId) {
      setFilterDeckId(routeDeckId);
    }
  }, [routeDeckId]);

  const [simType, setSimType] = useState<SimType>(
    () => parseSimParam(searchParams.get("sim")) ?? "fire_brick",
  );
  const [selectedGroupKey, setSelectedGroupKey] = useState(
    () => searchParams.get("vg") ?? "",
  );
  const [selectedLeaderboardCard, setSelectedLeaderboardCard] = useState<
    string | null
  >(() => searchParams.get("card"));
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [localEpoch, setLocalEpoch] = useState(0);
  const dataEpoch = refreshToken + localEpoch;

  const [compareOpen, setCompareOpen] = useState(false);
  const [compareDeckId, setCompareDeckId] = useState("");
  const [compareSimType, setCompareSimType] = useState<SimType>("fire_brick");
  const [compareGroupKey, setCompareGroupKey] = useState("");
  const [appliedRange, setAppliedRange] = useState<DamageRange | null>(null);

  const selectedDeck = filterDeckId
    ? (decks.find((deck) => deck.id === filterDeckId) ?? null)
    : null;
  const deckId = selectedDeck?.id;
  const deckHash = selectedDeck?.deckHash;

  const historyQuery = useRunHistoryQuery(
    deckId ? { deckId } : deckHash ? { deckHash } : undefined,
    dataEpoch,
  );
  const runs = historyQuery.data ?? [];

  const groupsQuery = useVersionGroupsQuery(
    {
      ...(deckId ? { deckId } : deckHash ? { deckHash } : {}),
      simType,
      kind: "evaluate",
    },
    dataEpoch,
  );
  const groups = deckId || deckHash ? (groupsQuery.data ?? []) : [];

  useEffect(() => {
    if (!deckId && !deckHash) {
      return;
    }
    if (groups.length === 0) {
      setSelectedGroupKey("");
      return;
    }
    setSelectedGroupKey((current) => {
      if (
        versionGroupFromUrl &&
        groups.some((group) => groupKey(group) === versionGroupFromUrl)
      ) {
        return versionGroupFromUrl;
      }
      if (current && groups.some((group) => groupKey(group) === current)) {
        return current;
      }
      return groups[0] ? groupKey(groups[0]) : "";
    });
  }, [deckId, deckHash, groups, versionGroupFromUrl]);

  const selectedGroup = useMemo(
    () => groups.find((group) => groupKey(group) === selectedGroupKey) ?? null,
    [groups, selectedGroupKey],
  );

  const poolHash = useMemo(
    () => resolvePoolHash(selectedDeck, simType, runs),
    [selectedDeck, simType, runs],
  );

  const pooledParams =
    selectedGroupKey && poolHash && selectedGroup?.attributionVersion
      ? {
          deckHash: poolHash,
          simType,
          rulesVersion: selectedGroup.rulesVersion,
          samplerVersion: selectedGroup.samplerVersion,
        }
      : null;

  const pooledQuery = usePooledDamageQuery(pooledParams, dataEpoch);
  const pooled = pooledQuery.data ?? null;

  const leaderboardParams =
    selectedGroupKey && poolHash && selectedGroup?.attributionVersion
      ? {
          deckHash: poolHash,
          simType,
          rulesVersion: selectedGroup.rulesVersion,
          samplerVersion: selectedGroup.samplerVersion,
          attributionVersion: selectedGroup.attributionVersion,
        }
      : null;

  const leaderboardQuery = useCardLeaderboardQuery(leaderboardParams, dataEpoch);
  const leaderboard = leaderboardQuery.data ?? null;

  const highlightsParams =
    selectedLeaderboardCard &&
    poolHash &&
    selectedGroup?.attributionVersion
      ? {
          deckHash: poolHash,
          simType,
          rulesVersion: selectedGroup.rulesVersion,
          samplerVersion: selectedGroup.samplerVersion,
        }
      : null;

  const highlightsQuery = usePooledSampleHighlightsQuery(
    highlightsParams,
    dataEpoch,
  );
  const sampleHighlights = highlightsQuery.data ?? null;

  const filteredLeaderboardParams =
    appliedRange && poolHash && selectedGroup?.attributionVersion
      ? {
          deckHash: poolHash,
          simType,
          rulesVersion: selectedGroup.rulesVersion,
          samplerVersion: selectedGroup.samplerVersion,
          attributionVersion: selectedGroup.attributionVersion,
          damageGte: appliedRange.gte,
          damageLte: appliedRange.lte,
        }
      : null;

  const filteredLeaderboardQuery = useCardLeaderboardQuery(
    filteredLeaderboardParams,
    dataEpoch,
  );
  const filteredLeaderboard = filteredLeaderboardQuery.data ?? null;

  const compareHistoryQuery = useRunHistoryQuery(
    compareOpen && compareDeckId ? { deckId: compareDeckId } : undefined,
    dataEpoch,
  );
  const compareRuns = compareOpen ? (compareHistoryQuery.data ?? []) : [];

  const compareGroupsQuery = useVersionGroupsQuery(
    {
      deckId: compareOpen && compareDeckId ? compareDeckId : undefined,
      simType: compareSimType,
      kind: "evaluate",
    },
    dataEpoch,
  );
  const compareGroups =
    compareOpen && compareDeckId ? (compareGroupsQuery.data ?? []) : [];

  useEffect(() => {
    if (!compareOpen || !compareDeckId) {
      setCompareGroupKey("");
      return;
    }
    if (compareGroups.length === 0) {
      setCompareGroupKey("");
      return;
    }
    setCompareGroupKey((current) => {
      if (current && compareGroups.some((group) => groupKey(group) === current)) {
        return current;
      }
      return compareGroups[0] ? groupKey(compareGroups[0]) : "";
    });
  }, [compareOpen, compareDeckId, compareGroups]);

  const compareDeck = useMemo(
    () => decks.find((deck) => deck.id === compareDeckId) ?? null,
    [decks, compareDeckId],
  );
  const compareGroup = useMemo(
    () =>
      compareGroups.find((group) => groupKey(group) === compareGroupKey) ??
      null,
    [compareGroups, compareGroupKey],
  );
  const comparePoolHash = useMemo(
    () => resolvePoolHash(compareDeck, compareSimType, compareRuns),
    [compareDeck, compareSimType, compareRuns],
  );

  const comparePooledParams =
    compareOpen && compareGroupKey && comparePoolHash && compareGroup
      ? {
          deckHash: comparePoolHash,
          simType: compareSimType,
          rulesVersion: compareGroup.rulesVersion,
          samplerVersion: compareGroup.samplerVersion,
        }
      : null;

  const comparePooledQuery = usePooledDamageQuery(comparePooledParams, dataEpoch);
  const comparePooled = comparePooledQuery.data ?? null;

  const simFromUrl = searchParams.get("sim");
  const cardFromUrl = searchParams.get("card");

  useEffect(() => {
    setSimType(parseSimParam(simFromUrl) ?? "fire_brick");
  }, [simFromUrl]);

  useEffect(() => {
    if (versionGroupFromUrl) {
      setSelectedGroupKey(versionGroupFromUrl);
    }
  }, [versionGroupFromUrl]);

  useEffect(() => {
    setSelectedLeaderboardCard(cardFromUrl);
  }, [cardFromUrl]);

  const pooledSampleKey = pooled
    ? `${poolHash ?? ""}:${simType}:${selectedGroupKey}:${pooled.runCount}`
    : "";
  const prevPooledSampleKeyRef = useRef(pooledSampleKey);

  useEffect(() => {
    const prev = prevPooledSampleKeyRef.current;
    if (prev === pooledSampleKey) {
      return;
    }
    prevPooledSampleKeyRef.current = pooledSampleKey;
    if (!prev) {
      return;
    }
    setSelectedLeaderboardCard(null);
    replaceQuery((current) => {
      if (!current.get("card")) {
        return current;
      }
      return historyQueryPatch(current, { card: null });
    });
  }, [pooledSampleKey, replaceQuery]);

  const loading =
    pooledQuery.isFetching ||
    leaderboardQuery.isFetching ||
    (Boolean(appliedRange) && filteredLeaderboardQuery.isFetching);
  const filterLoading =
    Boolean(appliedRange) && filteredLeaderboardQuery.isFetching;
  const compareLoading = comparePooledQuery.isFetching;

  const historyError = historyQuery.error;
  const pooledError = pooledQuery.error ?? leaderboardQuery.error;
  const compareError =
    comparePooledQuery.error instanceof Error
      ? comparePooledQuery.error.message
      : comparePooledQuery.isError && !comparePooled?.distribution
        ? "No pooled damage for that version group."
        : "";

  const error =
    deleteError ||
    (historyError instanceof Error ? historyError.message : "") ||
    (pooledError instanceof Error ? pooledError.message : "");

  const comparing =
    compareOpen &&
    !!comparePooled?.distribution &&
    !!pooled?.distribution;

  const activeLeaderboard = appliedRange ? filteredLeaderboard : leaderboard;

  async function handleDeleteRun(runId: string) {
    if (deletingId) {
      return;
    }
    setDeletingId(runId);
    setDeleteError("");
    try {
      await deleteRun(runId);
      setLocalEpoch((current) => current + 1);
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : "Could not delete that run.",
      );
    } finally {
      setDeletingId(null);
    }
  }

  function openCompare() {
    setCompareOpen(true);
    setCompareDeckId(selectedDeck?.id ?? decks[0]?.id ?? "");
    setCompareSimType(simType);
    setCompareGroupKey("");
  }

  function clearCompare() {
    setCompareOpen(false);
    setCompareDeckId("");
    setCompareGroupKey("");
  }

  return {
    searchParams,
    replaceQuery,
    filterDeckId,
    setFilterDeckId,
    runs,
    groups,
    simType,
    setSimType,
    selectedGroupKey,
    setSelectedGroupKey,
    pooled,
    leaderboard,
    sampleHighlights,
    selectedLeaderboardCard,
    setSelectedLeaderboardCard,
    error,
    loading,
    deletingId,
    dataEpoch,
    compareOpen,
    compareDeckId,
    setCompareDeckId,
    compareSimType,
    setCompareSimType,
    compareGroupKey,
    setCompareGroupKey,
    compareGroups,
    comparePooled,
    compareLoading,
    compareError,
    compareRuns,
    appliedRange,
    setAppliedRange,
    filteredLeaderboard,
    filterLoading,
    selectedDeck,
    selectedGroup,
    compareDeck,
    compareGroup,
    comparing,
    activeLeaderboard,
    handleDeleteRun,
    openCompare,
    clearCompare,
  };
}

export type UseHistoryPanelReturn = ReturnType<typeof useHistoryPanel>;
