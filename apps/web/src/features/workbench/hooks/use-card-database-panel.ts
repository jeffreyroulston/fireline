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
  type CardDatabaseSource,
  type CardPlayMatrixResponse,
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

  const versionGroupsQuery = useVersionGroupsQuery(
    {
      simType,
      kind:
        dbSource === "evaluate"
          ? "evaluate"
          : dbSource === "swap_sweep"
            ? "optimize"
            : undefined,
    },
    0,
  );
  const versionGroups = useMemo(
    () => versionGroupsQuery.data ?? [],
    [versionGroupsQuery.data],
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
    if (!currentEngine) return;
    const currentKey = `${currentEngine.rulesVersion}:${currentEngine.samplerVersion}:${currentEngine.attributionVersion}`;
    setDetailGroupKey((prev) => {
      if (prev === currentKey) return prev;
      if (prev && versionGroups.some((g) => groupKey(g) === prev)) return prev;
      return currentKey;
    });
  }, [currentEngine, versionGroups]);

  const selectedDeckId = useMemo(() => {
    if (!deckParam) return null;
    return deckParam;
  }, [deckParam]);

  const includedDeckIds = useMemo(() => {
    if (!selectedDeckId) return undefined;
    return [selectedDeckId];
  }, [selectedDeckId]);

  const catalogFiltersKey = `${dbSource}:${simType}:${currentEngine?.rulesVersion ?? ""}:${currentEngine?.samplerVersion ?? ""}:${currentEngine?.attributionVersion ?? ""}:${selectedDeckId ?? "all"}`;

  const catalogQuery = useCardDatabaseQuery(
    dbSource,
    catalogFiltersKey,
    () => {
      if (!currentEngine) {
        throw new Error("No engine version");
      }
      return fetchCardDatabase({
        source: dbSource,
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
    Boolean(currentEngine),
  );

  const catalogData = catalogQuery.data as CardDatabaseResponse | undefined;
  const contributors = useMemo((): CardDatabaseContributor[] => {
    return catalogData?.contributors ?? [];
  }, [catalogData]);
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

  const detailFiltersKey = `${dbSource}:${simType}:${detailGroupKey}:${validatedDeckId ?? "all"}`;

  const detailDecksQuery = useCardDatabaseCardDecksQuery(
    dbSource,
    selectedCard?.id ?? "",
    detailFiltersKey,
    () =>
      fetchCardDatabaseCardDecks({
        source: dbSource,
        cardId: selectedCard!.id,
        simType,
        rulesVersion: detailVersion!.rulesVersion,
        samplerVersion: detailVersion!.samplerVersion,
        attributionVersion: detailVersion!.attributionVersion,
        deckIds: includedDeckIds,
      }),
    Boolean(selectedCard && detailVersion),
  );

  const playMatrixQuery = useCardDatabasePlayMatrixQuery(
    selectedCard?.id ?? "",
    detailFiltersKey,
    () =>
      fetchCardDatabasePlayMatrix({
        source: dbSource,
        cardId: selectedCard!.id,
        simType,
        rulesVersion: detailVersion!.rulesVersion,
        samplerVersion: detailVersion!.samplerVersion,
        attributionVersion: detailVersion!.attributionVersion,
        deckIds: includedDeckIds,
      }),
    Boolean(selectedCard && detailVersion),
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
        source: dbSource,
        cardId: selectedCard!.id,
        simType,
        rulesVersion: detailVersion!.rulesVersion,
        samplerVersion: detailVersion!.samplerVersion,
        attributionVersion: detailVersion!.attributionVersion,
        deckIds: includedDeckIds,
      });
    },
    Boolean(selectedCard && detailVersion),
  );

  const historicalPerformanceQuery = useCardDatabaseQuery(
    dbSource,
    `detail:${selectedCard?.id ?? ""}:${detailFiltersKey}`,
    () =>
      fetchCardDatabase({
        source: dbSource,
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
      selectedCard && detailVersion && currentEngine && !isCurrentVersion,
    ),
  );

  const detailPerformance: CardDatabasePerformance | null = useMemo(() => {
    if (!selectedCard) return null;
    if (isCurrentVersion) {
      return selectedCard.performance ?? null;
    }
    const row = historicalPerformanceQuery.data?.cards.find(
      (c) => c.id === selectedCard.id,
    );
    return row?.performance ?? null;
  }, [selectedCard, isCurrentVersion, historicalPerformanceQuery.data]);

  const detailDecks: CardDatabaseDeckRow[] = detailDecksQuery.data?.decks ?? [];
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
  }, [selectedId, detailGroupKey, validatedDeckId, dbSource]);

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
    if (contributors.length === 0) {
      if (dbSource === "swap_sweep") {
        return "No swap-sweep runs for this sim yet.";
      }
      if (dbSource === "evaluate") {
        return "No evaluate runs for this sim yet.";
      }
      return "No runs for this sim yet.";
    }
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
  }, [contributors, validatedDeckId, dbSource]);

  function updateDbSource(source: CardDatabaseSource, clearSelection = false) {
    setDbSource(source);
    if (clearSelection) {
      setSelectedId(null);
    }
    replaceQuery((current) =>
      cardsQueryPatch(current, {
        source,
        deck: null,
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
    partnerMode,
    partnerSort,
    setPartnerSort,
    detailError,
    selectedCard,
    mainCards,
    materialCards,
    ownershipSummary,
    validatedDeckId,
    workerVersion,
    updateDbSource,
    selectCard,
    updateSimType,
    updateKindFilter,
    updateDeckFilter,
    handlePartnerModeChange,
  };
}

export type UseCardDatabasePanelReturn = ReturnType<typeof useCardDatabasePanel>;
