"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { type SimType } from "@/lib/engine";
import {
  fetchCardDatabase,
  fetchCardDatabaseCardDecks,
  fetchCardDatabasePairings,
  fetchCardDatabasePlayMatrix,
  type CardDatabaseCard,
  type CardDatabaseContributor,
  type CardDatabasePairingsResponse,
  type CardDatabasePerformance,
  type CardDatabaseResponse,
  type CardDatabaseRunContributor,
  type CardDatabaseSource,
  type CardDatabaseSwapSweepResponse,
  type CardPlayMatrixResponse,
  type SwapSweepCardRunRow,
  type WorkerVersion,
} from "@/lib/api/client";
import {
  useCardDatabaseCardDecksQuery,
  useCardDatabasePairingsQuery,
  useCardDatabasePlayMatrixQuery,
  useCardDatabaseQuery,
  useVersionGroupsQuery,
} from "@/hooks/api";
import type { DataTableSort } from "../ui";
import {
  cardsQueryPatch,
  parseCardDatabaseSource,
  parseKindParam,
  parseSimParam,
} from "../routes";
import { useWorkbenchQuery } from "./use-workbench-query";
import { groupKey } from "../panels/card-database/shared";
import type { PartnerMode } from "../panels/card-database/constants";
import { formatPct } from "../panels/card-database/formatters";

type CardDatabaseDeckRow = {
  deckId: string;
  name: string;
  copies: number | null;
  runCount: number;
  samples: number;
  damageWhenSeen: number | null;
  withHandMean: number | null;
  withoutHandMean: number | null;
  handLift: number | null;
  withHandSamples: number;
  withoutHandSamples: number;
};

type UseCardDatabasePanelOptions = Readonly<{
  workerVersion: WorkerVersion | null;
}>;

export function useCardDatabasePanel({
  workerVersion,
}: UseCardDatabasePanelOptions) {
  const router = useRouter();
  const { searchParams, replaceQuery, pushQuery } = useWorkbenchQuery("cards");
  const [dbSource, setDbSource] = useState<CardDatabaseSource>(() =>
    parseCardDatabaseSource(searchParams.get("source")),
  );
  const [simType, setSimType] = useState<SimType>(
    () => parseSimParam(searchParams.get("sim")) ?? "fire_brick",
  );
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<string | null>(() =>
    parseKindParam(searchParams.get("kind")),
  );
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    searchParams.get("card"),
  );
  const [detailGroupKey, setDetailGroupKey] = useState("");
  const [partnerMode, setPartnerMode] = useState<PartnerMode>("pairs_with_me");
  const [partnerSort, setPartnerSort] = useState<DataTableSort>({
    columnId: "delta",
    direction: "desc",
  });

  useEffect(() => {
    setDbSource(parseCardDatabaseSource(searchParams.get("source")));
    setSimType(parseSimParam(searchParams.get("sim")) ?? "fire_brick");
    setKindFilter(parseKindParam(searchParams.get("kind")));
    setSelectedId(searchParams.get("card"));
  }, [searchParams]);

  const deckParam = searchParams.get("deck");
  const runParam = searchParams.get("run");

  const versionGroupsQuery = useVersionGroupsQuery(
    { simType, kind: "evaluate" },
    0,
  );
  const versionGroups = useMemo(
    () =>
      dbSource === "evaluate" ? (versionGroupsQuery.data ?? []) : [],
    [dbSource, versionGroupsQuery.data],
  );
  const groupsLoading = versionGroupsQuery.isLoading;

  const currentEngine = useMemo(() => {
    if (workerVersion) {
      return {
        rulesVersion: workerVersion.rules,
        samplerVersion: workerVersion.sampler,
        attributionVersion: workerVersion.attribution,
      };
    }
    const latest = versionGroups[0];
    if (!latest) return null;
    return {
      rulesVersion: latest.rulesVersion,
      samplerVersion: latest.samplerVersion,
      attributionVersion: latest.attributionVersion ?? 0,
    };
  }, [workerVersion, versionGroups]);

  useEffect(() => {
    if (dbSource !== "evaluate") return;
    if (!currentEngine) return;
    const currentKey = `${currentEngine.rulesVersion}:${currentEngine.samplerVersion}:${currentEngine.attributionVersion}`;
    setDetailGroupKey((prev) => {
      if (prev && versionGroups.some((g) => groupKey(g) === prev)) return prev;
      if (versionGroups.some((g) => groupKey(g) === currentKey)) return currentKey;
      return versionGroups[0] ? groupKey(versionGroups[0]) : currentKey;
    });
  }, [currentEngine, versionGroups, dbSource]);

  const selectedDeckId = useMemo(() => {
    if (!deckParam) return null;
    return deckParam;
  }, [deckParam]);

  const selectedRunId = useMemo(() => {
    if (!runParam) return null;
    return runParam;
  }, [runParam]);

  const includedDeckIds = useMemo(() => {
    if (!selectedDeckId) return undefined;
    return [selectedDeckId];
  }, [selectedDeckId]);

  const includedRunIds = useMemo(() => {
    if (!selectedRunId) return undefined;
    return [selectedRunId];
  }, [selectedRunId]);

  const catalogFiltersKey = `${simType}:${currentEngine?.rulesVersion ?? ""}:${currentEngine?.samplerVersion ?? ""}:${currentEngine?.attributionVersion ?? ""}:${selectedDeckId ?? "all"}:${selectedRunId ?? "all"}`;

  const catalogQuery = useCardDatabaseQuery(
    dbSource,
    catalogFiltersKey,
    () => {
      if (dbSource === "swap_sweep") {
        return fetchCardDatabase({
          source: "swap_sweep",
          runIds: includedRunIds,
        });
      }
      if (!currentEngine) {
        throw new Error("No engine version");
      }
      return fetchCardDatabase({
        source: "evaluate",
        simType,
        rulesVersion: currentEngine.rulesVersion,
        samplerVersion: currentEngine.samplerVersion,
        attributionVersion: currentEngine.attributionVersion,
        currentRulesVersion: currentEngine.rulesVersion,
        currentSamplerVersion: currentEngine.samplerVersion,
        currentAttributionVersion: currentEngine.attributionVersion,
        deckIds: includedDeckIds,
      });
    },
    dbSource === "swap_sweep" ? true : Boolean(currentEngine),
  );

  const catalogData = catalogQuery.data;
  const contributors = useMemo((): CardDatabaseContributor[] => {
    if (
      catalogData &&
      "contributors" in catalogData &&
      dbSource === "evaluate"
    ) {
      return (catalogData as CardDatabaseResponse).contributors;
    }
    return [];
  }, [catalogData, dbSource]);
  const swapSweepContributors = useMemo((): CardDatabaseRunContributor[] => {
    if (
      catalogData &&
      "contributors" in catalogData &&
      dbSource === "swap_sweep"
    ) {
      return (catalogData as CardDatabaseSwapSweepResponse).contributors;
    }
    return [];
  }, [catalogData, dbSource]);
  const cards = useMemo(
    (): CardDatabaseCard[] => catalogData?.cards ?? [],
    [catalogData?.cards],
  );
  const totalRuns = catalogData?.totalRuns ?? 0;
  const totalSamples = catalogData?.totalSamples ?? 0;
  const loading = catalogQuery.isFetching;
  const error =
    catalogQuery.error instanceof Error
      ? catalogQuery.error.message
      : versionGroupsQuery.error instanceof Error
        ? versionGroupsQuery.error.message
        : "";

  const validatedDeckId = useMemo(() => {
    if (!selectedDeckId) return null;
    if (contributors.length === 0) return selectedDeckId;
    return contributors.some((entry) => entry.deckId === selectedDeckId)
      ? selectedDeckId
      : null;
  }, [selectedDeckId, contributors]);

  const validatedRunId = useMemo(() => {
    if (!selectedRunId) return null;
    if (swapSweepContributors.length === 0) return selectedRunId;
    return swapSweepContributors.some((entry) => entry.runId === selectedRunId)
      ? selectedRunId
      : null;
  }, [selectedRunId, swapSweepContributors]);

  const selectedCard = useMemo(
    () => cards.find((card) => card.id === selectedId) ?? null,
    [cards, selectedId],
  );

  const detailVersion = useMemo(() => {
    if (!currentEngine || !detailGroupKey) return null;
    const group =
      versionGroups.find((g) => groupKey(g) === detailGroupKey) ?? null;
    return group
      ? {
          rulesVersion: group.rulesVersion,
          samplerVersion: group.samplerVersion,
          attributionVersion:
            group.attributionVersion ?? currentEngine.attributionVersion,
        }
      : currentEngine;
  }, [currentEngine, detailGroupKey, versionGroups]);

  const isCurrentVersion =
    detailVersion &&
    currentEngine &&
    detailVersion.rulesVersion === currentEngine.rulesVersion &&
    detailVersion.samplerVersion === currentEngine.samplerVersion &&
    detailVersion.attributionVersion === currentEngine.attributionVersion;

  const detailFiltersKey = `${dbSource}:${simType}:${detailGroupKey}:${validatedDeckId ?? "all"}:${validatedRunId ?? "all"}`;

  const detailDecksQuery = useCardDatabaseCardDecksQuery(
    dbSource,
    selectedCard?.id ?? "",
    detailFiltersKey,
    () => {
      if (dbSource === "swap_sweep") {
        return fetchCardDatabaseCardDecks({
          source: "swap_sweep",
          cardId: selectedCard!.id,
          runIds: includedRunIds,
        });
      }
      return fetchCardDatabaseCardDecks({
        source: "evaluate",
        cardId: selectedCard!.id,
        simType,
        rulesVersion: detailVersion!.rulesVersion,
        samplerVersion: detailVersion!.samplerVersion,
        attributionVersion: detailVersion!.attributionVersion,
        deckIds: includedDeckIds,
      });
    },
    Boolean(selectedCard),
  );

  const playMatrixQuery = useCardDatabasePlayMatrixQuery(
    selectedCard?.id ?? "",
    detailFiltersKey,
    () =>
      fetchCardDatabasePlayMatrix({
        cardId: selectedCard!.id,
        simType,
        rulesVersion: detailVersion!.rulesVersion,
        samplerVersion: detailVersion!.samplerVersion,
        attributionVersion: detailVersion!.attributionVersion,
        deckIds: includedDeckIds,
      }),
    Boolean(
      selectedCard &&
        dbSource === "evaluate" &&
        detailVersion &&
        selectedCard.kind !== "material",
    ),
  );

  const pairingsQuery = useCardDatabasePairingsQuery(
    selectedCard?.id ?? "",
    detailFiltersKey,
    () => {
      if (selectedCard!.kind === "material") {
        return Promise.resolve({
          cardId: selectedCard!.id,
          totalSamples: 0,
          partners: [],
        } satisfies CardDatabasePairingsResponse);
      }
      return fetchCardDatabasePairings({
        cardId: selectedCard!.id,
        simType,
        rulesVersion: detailVersion!.rulesVersion,
        samplerVersion: detailVersion!.samplerVersion,
        attributionVersion: detailVersion!.attributionVersion,
        deckIds: includedDeckIds,
      });
    },
    Boolean(
      selectedCard && dbSource === "evaluate" && detailVersion,
    ),
  );

  const historicalPerformanceQuery = useCardDatabaseQuery(
    "evaluate",
    `detail:${selectedCard?.id ?? ""}:${detailFiltersKey}`,
    () =>
      fetchCardDatabase({
        source: "evaluate",
        simType,
        rulesVersion: detailVersion!.rulesVersion,
        samplerVersion: detailVersion!.samplerVersion,
        attributionVersion: detailVersion!.attributionVersion,
        currentRulesVersion: currentEngine!.rulesVersion,
        currentSamplerVersion: currentEngine!.samplerVersion,
        currentAttributionVersion: currentEngine!.attributionVersion,
        deckIds: includedDeckIds,
      }),
    Boolean(
      selectedCard &&
        dbSource === "evaluate" &&
        detailVersion &&
        currentEngine &&
        !isCurrentVersion,
    ),
  );

  const detailPerformance: CardDatabasePerformance | null = useMemo(() => {
    if (!selectedCard) return null;
    if (dbSource === "swap_sweep") {
      return selectedCard.performance ?? null;
    }
    if (isCurrentVersion) {
      return selectedCard.performance ?? null;
    }
    const row = historicalPerformanceQuery.data?.cards.find(
      (c) => c.id === selectedCard.id,
    );
    return row?.performance ?? null;
  }, [
    selectedCard,
    dbSource,
    isCurrentVersion,
    historicalPerformanceQuery.data,
  ]);

  const detailDecks: CardDatabaseDeckRow[] =
    detailDecksQuery.data && "decks" in detailDecksQuery.data
      ? detailDecksQuery.data.decks
      : [];
  const detailSwapRuns: SwapSweepCardRunRow[] =
    detailDecksQuery.data && "runs" in detailDecksQuery.data
      ? detailDecksQuery.data.runs
      : [];
  const detailPlayMatrix: CardPlayMatrixResponse | null =
    playMatrixQuery.data ?? null;
  const detailPairings: CardDatabasePairingsResponse | null =
    pairingsQuery.data ?? null;

  const detailError =
    detailDecksQuery.error instanceof Error
      ? detailDecksQuery.error.message
      : playMatrixQuery.error instanceof Error
        ? playMatrixQuery.error.message
        : pairingsQuery.error instanceof Error
          ? pairingsQuery.error.message
          : "";

  useEffect(() => {
    setPartnerMode("pairs_with_me");
    setPartnerSort({ columnId: "delta", direction: "desc" });
  }, [selectedId, detailGroupKey, validatedDeckId, validatedRunId, dbSource]);

  const { mainCards, materialCards } = useMemo(() => {
    const q = search.trim().toLowerCase();
    const match = (card: CardDatabaseCard) => {
      if (q) {
        const hay = `${card.name} ${card.short} ${card.id}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (card.kind === "material") return true;
      if (kindFilter && card.kind !== kindFilter) return false;
      return true;
    };
    const filtered = cards.filter(match);
    return {
      mainCards: filtered.filter(
        (card) =>
          card.kind !== "material" &&
          card.kind !== "brick" &&
          card.id !== "brick",
      ),
      materialCards: filtered.filter((card) => card.kind === "material"),
    };
  }, [cards, search, kindFilter]);

  const ownershipSummary = useMemo(() => {
    if (dbSource === "swap_sweep") {
      if (swapSweepContributors.length === 0) {
        return "No swap-sweep runs yet.";
      }
      if (validatedRunId) {
        const run = swapSweepContributors.find(
          (entry) => entry.runId === validatedRunId,
        );
        if (run) {
          return `${run.deckName} · ${run.candidateCount} candidate${
            run.candidateCount === 1 ? "" : "s"
          } · ${run.samples.toLocaleString()} samples`;
        }
      }
      const samples = swapSweepContributors.reduce(
        (sum, entry) => sum + entry.samples,
        0,
      );
      return `${swapSweepContributors.length} run${
        swapSweepContributors.length === 1 ? "" : "s"
      } · ${samples.toLocaleString()} samples`;
    }
    if (contributors.length === 0) return "No evaluate runs for this sim yet.";
    if (validatedDeckId) {
      const deck = contributors.find((entry) => entry.deckId === validatedDeckId);
      if (deck) {
        return `${deck.name} · ${deck.runCount} run${
          deck.runCount === 1 ? "" : "s"
        } · ${deck.samples.toLocaleString()} samples`;
      }
    }
    const samples = contributors.reduce((sum, entry) => sum + entry.samples, 0);
    const top = contributors[0];
    const topPct = top && samples > 0 ? formatPct(top.samples / samples) : null;
    const parts = [
      `${contributors.length} deck${contributors.length === 1 ? "" : "s"}`,
      `${samples.toLocaleString()} samples`,
    ];
    if (top && topPct) {
      parts.push(`${top.name} ${topPct}`);
    }
    return parts.join(" · ");
  }, [
    contributors,
    validatedDeckId,
    dbSource,
    swapSweepContributors,
    validatedRunId,
  ]);

  function updateDbSource(source: CardDatabaseSource, clearSelection = false) {
    setDbSource(source);
    if (clearSelection) {
      setSelectedId(null);
    }
    replaceQuery((current) =>
      cardsQueryPatch(current, {
        source,
        deck: null,
        run: null,
        ...(clearSelection ? { card: null } : {}),
      }),
    );
  }

  function selectCard(cardId: string | null) {
    if (cardId) {
      setSelectedId(cardId);
      pushQuery((current) => cardsQueryPatch(current, { card: cardId }));
      return;
    }
    router.back();
  }

  function updateSimType(value: SimType, clearSelection = false) {
    setSimType(value);
    if (clearSelection) {
      setSelectedId(null);
    }
    replaceQuery((current) =>
      cardsQueryPatch(current, {
        sim: value,
        deck: null,
        ...(clearSelection ? { card: null } : {}),
      }),
    );
  }

  function updateKindFilter(kind: string | null) {
    setKindFilter(kind);
    replaceQuery((current) => cardsQueryPatch(current, { kind }));
  }

  function updateDeckFilter(deckId: string | null) {
    replaceQuery((current) => cardsQueryPatch(current, { deck: deckId }));
  }

  function updateRunFilter(runId: string | null) {
    replaceQuery((current) => cardsQueryPatch(current, { run: runId }));
  }

  function handlePartnerModeChange(mode: PartnerMode) {
    setPartnerMode(mode);
    setPartnerSort({ columnId: "delta", direction: "desc" });
  }

  return {
    dbSource,
    simType,
    search,
    setSearch,
    kindFilter,
    contributors,
    swapSweepContributors,
    cards,
    totalRuns,
    totalSamples,
    loading,
    error,
    selectedId,
    versionGroups,
    groupsLoading,
    currentEngine,
    detailGroupKey,
    setDetailGroupKey,
    detailPerformance,
    detailDecks,
    detailPlayMatrix,
    detailPairings,
    detailSwapRuns,
    partnerMode,
    partnerSort,
    setPartnerSort,
    detailError,
    selectedCard,
    mainCards,
    materialCards,
    ownershipSummary,
    validatedDeckId,
    validatedRunId,
    workerVersion,
    updateDbSource,
    selectCard,
    updateSimType,
    updateKindFilter,
    updateDeckFilter,
    updateRunFilter,
    handlePartnerModeChange,
  };
}

export type UseCardDatabasePanelReturn = ReturnType<typeof useCardDatabasePanel>;
