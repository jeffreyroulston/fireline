"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CARDS,
  formatDecklist,
  materialDeckCounts,
  parseMaterialDecklist,
  PLAYABLE_CARD_IDS,
  type DeckCounts,
} from "@/lib/engine";
import {
  loadActiveDeckId,
} from "@/lib/decks";
import {
  DEFAULT_MATERIAL_DECK_TEXT,
  formatMaterialDeckDeleteError,
  type SavedMaterialDeck,
} from "@/lib/material-decks";
import { useCatalogContext } from "./catalog-context";
import { useWorkbenchDeck } from "./workbench-deck-context";
import { useRatioState, useShellSolver } from "./hooks";
import {
  DeckTab,
  InfoTab,
  LineTab,
  ManageTab,
  RatiosTab,
  WorkbenchChrome,
} from "./tabs";
import { WorkbenchPanelLoader } from "./ui/workbench-loader";
import type { Tab } from "./types";
import { workbenchHref } from "./routes";

const HistoryPanel = dynamic(
  () =>
    import("./panels/history").then((module) => ({
      default: module.HistoryPanel,
    })),
  { loading: () => <WorkbenchPanelLoader /> },
);

const CardDatabasePanel = dynamic(
  () =>
    import("./panels/card-database").then((module) => ({
      default: module.CardDatabasePanel,
    })),
  { loading: () => <WorkbenchPanelLoader /> },
);

export default function FizaWorkbench({
  tab,
  deckId: routeDeckId,
}: Readonly<{
  tab: Tab;
  deckId?: string;
}>) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { catalogEpoch, workerVersion } = useCatalogContext();
  const {
    decks,
    materialDecks,
    decksHydrated,
    activeDeckId,
    activeDeck,
    activeMaterialDeck,
    deckText,
    updateActiveDeckText,
    updateActiveDeckMaterialDeck,
    syncDeckRunCounts,
    createNewDeck: createNewDeckRemote,
    duplicateActiveDeck: duplicateActiveDeckRemote,
    commitDeckRename: commitDeckRenameRemote,
    deleteActiveDeck: deleteActiveDeckRemote,
    saveRatioDecklist: saveRatioDecklistRemote,
    createNewMaterialDeck: createNewMaterialDeckRemote,
    commitMaterialDeckRename: commitMaterialDeckRenameRemote,
    deleteActiveMaterialDeck: deleteActiveMaterialDeckRemote,
  } = useWorkbenchDeck();

  const [isRenamingDeck, setIsRenamingDeck] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");
  const [isRenamingMaterialDeck, setIsRenamingMaterialDeck] = useState(false);
  const [materialRenameDraft, setMaterialRenameDraft] = useState("");

  const runParam = searchParams.get("run");
  const activeMaterialCounts = useMemo(() => {
    if (!activeMaterialDeck) {
      return materialDeckCounts(parseMaterialDecklist(DEFAULT_MATERIAL_DECK_TEXT));
    }
    return materialDeckCounts(parseMaterialDecklist(activeMaterialDeck.text));
  }, [activeMaterialDeck]);

  const ratio = useRatioState({
    deckText,
    activeDeckId,
    decksHydrated,
  });

  const solver = useShellSolver({
    deckText,
    activeDeck,
    activeDeckId,
    activeMaterialCounts,
    runParam,
    ratio,
    router,
    syncDeckRunCounts,
    decksHydrated,
  });

  useEffect(() => {
    if (!decksHydrated || decks.length === 0) {
      return;
    }
    const valid = new Set(decks.map((deck) => deck.id));
    const resolved =
      routeDeckId && valid.has(routeDeckId)
        ? routeDeckId
        : loadActiveDeckId(decks);
    if (!routeDeckId || !valid.has(routeDeckId)) {
      const qs = searchParams.toString();
      router.replace(workbenchHref(tab, resolved, qs || undefined), {
        scroll: false,
      });
    }
    // Only redirect when the route deck is missing/invalid — not on query-only changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- searchParams read for initial redirect qs only
  }, [decksHydrated, decks, routeDeckId, tab, router]);

  useEffect(() => {
    if (catalogEpoch > 0) {
      solver.setSelectedCard((current) =>
        current in CARDS ? current : (PLAYABLE_CARD_IDS[0] ?? current),
      );
    }
    // setSelectedCard is a stable useState setter from useShellSolver.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogEpoch]);

  useEffect(() => {
    if (!decksHydrated) {
      return;
    }
    setIsRenamingDeck(false);
  }, [activeDeckId, decksHydrated]);

  function navigateToDeck(deckId: string) {
    const qs = searchParams.toString();
    router.push(workbenchHref(tab, deckId, qs || undefined), { scroll: false });
  }

  function switchDeck(deckId: string) {
    navigateToDeck(deckId);
  }

  function openRatioRun(runId: string, deckId: string) {
    router.push(workbenchHref("ratios", deckId, `run=${runId}`), {
      scroll: false,
    });
  }

  async function saveRatioDecklist(
    counts: DeckCounts,
    score: number,
    rank: number,
    deckName?: string,
  ) {
    const text = formatDecklist(counts);
    const preferredName = `${deckName ?? ratio.ratioCriteria?.baseDeckName ?? activeDeck?.name ?? "Deck"} · Ratio #${rank} · ${score.toFixed(2)}`;
    const deck = await saveRatioDecklistRemote(text, preferredName);
    if (deck) {
      navigateToDeck(deck.id);
      solver.setError("");
    } else {
      solver.setError("Could not save the deck.");
    }
  }

  async function createNewDeck() {
    const deck = await createNewDeckRemote();
    if (deck) {
      navigateToDeck(deck.id);
      solver.setError("");
      setIsRenamingDeck(false);
    } else {
      solver.setError("Could not create a deck.");
    }
  }

  async function duplicateActiveDeck() {
    const deck = await duplicateActiveDeckRemote();
    if (deck) {
      navigateToDeck(deck.id);
      solver.setError("");
      setIsRenamingDeck(false);
    } else {
      solver.setError("Could not duplicate the deck.");
    }
  }

  function startRenamingMaterialDeck() {
    if (!activeMaterialDeck) {
      return;
    }
    setMaterialRenameDraft(activeMaterialDeck.name);
    setIsRenamingMaterialDeck(true);
  }

  async function commitMaterialDeckRename() {
    try {
      await commitMaterialDeckRenameRemote(materialRenameDraft);
      setIsRenamingMaterialDeck(false);
      solver.setError("");
    } catch (renameError) {
      solver.setError(
        renameError instanceof Error
          ? renameError.message
          : "Could not rename the material deck.",
      );
    }
  }

  function cancelMaterialDeckRename() {
    setIsRenamingMaterialDeck(false);
    setMaterialRenameDraft("");
  }

  async function deleteActiveMaterialDeck(deck: SavedMaterialDeck) {
    try {
      await deleteActiveMaterialDeckRemote(deck);
      solver.setError("");
    } catch (deleteError) {
      solver.setError(
        deleteError instanceof Error
          ? deleteError.message
          : formatMaterialDeckDeleteError(deleteError),
      );
    }
  }

  async function createNewMaterialDeck(name: string, text: string) {
    const deck = await createNewMaterialDeckRemote(name, text);
    if (deck) {
      solver.setError("");
      setIsRenamingMaterialDeck(false);
      return deck;
    }
    solver.setError("Could not create the material deck.");
    return null;
  }

  function startRenamingDeck() {
    if (!activeDeck) {
      return;
    }
    setRenameDraft(activeDeck.name);
    setIsRenamingDeck(true);
  }

  function commitDeckRename() {
    commitDeckRenameRemote(renameDraft);
    setIsRenamingDeck(false);
  }

  function cancelDeckRename() {
    setIsRenamingDeck(false);
    setRenameDraft("");
  }

  async function deleteActiveDeck() {
    const fallback = await deleteActiveDeckRemote();
    if (fallback) {
      navigateToDeck(fallback.id);
      solver.setError("");
      setIsRenamingDeck(false);
    } else if (activeDeck) {
      solver.setError("Could not delete the deck.");
    }
  }

  const decksLoading = !decksHydrated;

  return (
    <WorkbenchChrome
      tab={tab}
      activeDeckId={activeDeckId}
      workerVersion={workerVersion}
      onTabClick={() => solver.setError("")}
    >
      <section
        className="relative min-h-[540px] py-7 pb-9 [overflow-anchor:none] [&>.result-rail]:mt-2 [&>.result-rail]:border-t [&>.result-rail]:border-l-0 [&>.result-rail]:pt-7 [&>.result-rail]:pl-0"
        key={catalogEpoch}
      >
        {tab === "line" && (
          <LineTab
            hand={solver.hand}
            drawn={solver.drawn}
            orderedDeck={solver.orderedDeck}
            deckText={deckText}
            activeMaterialCounts={activeMaterialCounts}
            solverMode={solver.solverMode}
            selectedCard={solver.selectedCard}
            decks={decks}
            activeDeck={activeDeck}
            recognizedDeckCount={solver.recognizedDeckCount}
            shuffled={solver.orderedDeck.length > 0}
            seed={solver.solveSeed}
            goFirst={solver.goFirst}
            turns={solver.turns}
            turn2KillEnabled={solver.turn2KillEnabled}
            turn2KillThreshold={solver.turn2KillThreshold}
            simType={solver.simType}
            rollouts={solver.rollouts}
            cpuCount={solver.cpuCount}
            maxThreads={solver.maxThreads}
            glimpseEnabled={solver.glimpseEnabled}
            maxHandDurationSecs={solver.maxHandDurationSecs}
            maxCardDraw={solver.maxCardDraw}
            busy={solver.busy === "solve"}
            error={solver.error}
            lineResult={solver.lineResult}
            lineHand={solver.lineHand}
            turn2KillResults={solver.turn2KillResults}
            lineHorizon={solver.lineHorizon}
            decksLoading={decksLoading}
            onHandChange={solver.setHand}
            onSolverModeChange={solver.onSolverModeChange}
            onSelectedCardChange={solver.setSelectedCard}
            onSwitchDeck={switchDeck}
            onDrawRandomHand={solver.drawRandomHandFromDeck}
            onShuffleDeck={solver.shuffleDeckFromSeed}
            onGoFirstChange={solver.setGoFirst}
            onTurnsChange={solver.setTurns}
            onTurn2KillEnabledChange={solver.setTurn2KillEnabled}
            onTurn2KillThresholdChange={solver.setTurn2KillThreshold}
            onLineHorizonChange={solver.setLineHorizon}
            onSimTypeChange={solver.onSimTypeChange}
            onRolloutsChange={solver.setRollouts}
            onMaxThreadsChange={solver.setMaxThreads}
            onGlimpseEnabledChange={solver.setGlimpseEnabled}
            onMaxHandDurationSecsChange={solver.setMaxHandDurationSecs}
            onMaxCardDrawChange={solver.setMaxCardDraw}
            onSeedChange={solver.applySolveSeed}
            onSolve={solver.solveHand}
            onCancel={solver.cancelHandSolve}
            onError={solver.setError}
            onImportLine={solver.importLine}
          />
        )}

        {tab === "manage" && (
          <ManageTab
            decks={decks}
            activeDeck={activeDeck}
            deckText={deckText}
            deckCards={solver.deckAnalysisCards}
            recognizedDeckCount={solver.recognizedDeckCount}
            unrecognizedLines={solver.unrecognizedLines}
            isRenamingDeck={isRenamingDeck}
            renameDraft={renameDraft}
            materialDecks={materialDecks}
            activeMaterialDeck={activeMaterialDeck}
            isRenamingMaterialDeck={isRenamingMaterialDeck}
            materialRenameDraft={materialRenameDraft}
            decksLoading={decksLoading}
            onSwitchDeck={switchDeck}
            onCreateDeck={createNewDeck}
            onDuplicateDeck={duplicateActiveDeck}
            onStartRename={startRenamingDeck}
            onDeleteDeck={deleteActiveDeck}
            onRenameDraftChange={setRenameDraft}
            onCommitRename={commitDeckRename}
            onCancelRename={cancelDeckRename}
            onDeckTextChange={updateActiveDeckText}
            onAssignMaterialDeck={updateActiveDeckMaterialDeck}
            onCreateMaterialDeck={createNewMaterialDeck}
            onStartMaterialRename={startRenamingMaterialDeck}
            onDeleteMaterialDeck={deleteActiveMaterialDeck}
            onMaterialRenameDraftChange={setMaterialRenameDraft}
            onCommitMaterialRename={commitMaterialDeckRename}
            onCancelMaterialRename={cancelMaterialDeckRename}
          />
        )}

        {tab === "deck" && (
          <DeckTab
            decks={decks}
            activeDeck={activeDeck}
            recognizedDeckCount={solver.recognizedDeckCount}
            samples={solver.samples}
            goFirst={solver.goFirst}
            turns={solver.turns}
            simType={solver.simType}
            rollouts={solver.rollouts}
            cpuCount={solver.cpuCount}
            maxThreads={solver.maxThreads}
            glimpseEnabled={solver.glimpseEnabled}
            maxHandDurationSecs={solver.maxHandDurationSecs}
            maxCardDraw={solver.maxCardDraw}
            seed={solver.solveSeed}
            evaluateBusy={solver.evaluateBusy}
            evaluateRun={solver.evaluateRun}
            decksLoading={decksLoading}
            onSwitchDeck={switchDeck}
            onSamplesChange={solver.setSamples}
            onGoFirstChange={solver.setGoFirst}
            onTurnsChange={solver.setTurns}
            onSimTypeChange={solver.onSimTypeChange}
            onRolloutsChange={solver.setRollouts}
            onMaxThreadsChange={solver.setMaxThreads}
            onGlimpseEnabledChange={solver.setGlimpseEnabled}
            onMaxHandDurationSecsChange={solver.setMaxHandDurationSecs}
            onMaxCardDrawChange={solver.setMaxCardDraw}
            onSeedChange={solver.applySolveSeed}
            onEvaluate={solver.evaluateCurrentDeck}
            onCancel={solver.cancelEvaluateJob}
            onSave={
              solver.evaluateRun?.status === "running"
                ? solver.saveEvaluateJob
                : undefined
            }
            onSendToHandSolver={solver.sendSampleToHandSolver}
          />
        )}

        {tab === "ratios" && (
          <RatiosTab
            decks={decks}
            activeDeck={activeDeck}
            ratio={ratio}
            goFirst={solver.goFirst}
            turns={solver.turns}
            simType={solver.simType}
            rollouts={solver.rollouts}
            cpuCount={solver.cpuCount}
            maxThreads={solver.maxThreads}
            glimpseEnabled={solver.glimpseEnabled}
            maxHandDurationSecs={solver.maxHandDurationSecs}
            maxCardDraw={solver.maxCardDraw}
            seed={solver.solveSeed}
            optimizeRun={solver.optimizeRun}
            optimizeBusy={solver.optimizeBusy}
            decksLoading={decksLoading}
            onSwitchDeck={switchDeck}
            onGoFirstChange={solver.setGoFirst}
            onTurnsChange={solver.setTurns}
            onSimTypeChange={solver.onSimTypeChange}
            onRolloutsChange={solver.setRollouts}
            onMaxThreadsChange={solver.setMaxThreads}
            onGlimpseEnabledChange={solver.setGlimpseEnabled}
            onMaxHandDurationSecsChange={solver.setMaxHandDurationSecs}
            onMaxCardDrawChange={solver.setMaxCardDraw}
            onSeedChange={solver.applySolveSeed}
            onOptimize={solver.optimizeCurrentBounds}
            onCancelOptimize={solver.cancelOptimizeJob}
            onSaveOptimize={
              solver.optimizeRun?.status === "running"
                ? solver.saveOptimizeJob
                : undefined
            }
            onSaveDecklist={saveRatioDecklist}
            onRetestSelected={(decks) => {
              ratio.setMultiDeckLists(decks);
              ratio.setRatioStrategy("multiDeck");
            }}
          />
        )}

        {tab === "history" && (
          <HistoryPanel
            decks={decks}
            routeDeckId={routeDeckId}
            refreshToken={solver.historyEpoch}
            onSwitchDeck={switchDeck}
            onSaveDecklist={(counts, score, rank, deckName) =>
              saveRatioDecklist(counts, score, rank, deckName)
            }
            onOpenRatioRun={openRatioRun}
          />
        )}

        {tab === "cards" && <CardDatabasePanel workerVersion={workerVersion} />}

        {tab === "info" && <InfoTab />}

        {solver.error && tab !== "history" && tab !== "info" && tab !== "cards" && (
          <p
            className="mt-5 border-l-4 border-primary bg-primary/10 px-[15px] py-3 text-[13px]"
            role="alert"
          >
            {solver.error}
          </p>
        )}
      </section>
    </WorkbenchChrome>
  );
}
