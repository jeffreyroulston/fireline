"use client";

import {
  startTransition,
  useDeferredValue,
  useEffect,
  useState,
} from "react";
import {
  CARDS,
  MAX_RATIO_DECK_ATTEMPTS,
  PLAYABLE_CARD_IDS,
  countLegalDecklists,
  deckAttemptPercent,
  listToCounts,
  parseDecklist,
  type CardId,
  type DeckCounts,
  type OptimizeBounds,
  type SimType,
  type SolveResult,
} from "@/lib/engine";
import { hydrateCardCatalogFromApi } from "@/lib/api/catalog";
import { solve as apiSolve } from "@/lib/api/client";
import { useRun, type OptimizeProgress } from "@/lib/api/useRun";
import {
  createDeckRemote,
  deleteDeckRemote,
  loadDecksFromApi,
  nextDeckName,
  normalizeDeckName,
  saveActiveDeckId,
  scheduleDeckSave,
  type SavedDeck,
} from "@/lib/decks";
import { DRILL_3_HAND } from "@/lib/fixtures/drills";
import { DeckEditor, DeckResults } from "./deck";
import { HandBuilder, ResultRail } from "./line";
import {
  BoundsTable,
  PermutationPanel,
  RatioControls,
  RatioImportPanel,
  RatioResults,
} from "./ratios";
import { HistoryPanel } from "./history";
import { ActionBar } from "./shared";
import type { DeckResult, JobType, RatioResult, SampleHand, Tab } from "./types";
import { deckCountsCoveringHand, makeBounds, makeSeed } from "./utils";

export default function FizaWorkbench() {
  const [tab, setTab] = useState<Tab>("line");
  const [hand, setHand] = useState<CardId[]>(DRILL_3_HAND);
  const [selectedCard, setSelectedCard] = useState<CardId>("arthur");
  const [goFirst, setGoFirst] = useState(true);
  const [turns, setTurns] = useState(3);
  const [simType, setSimType] = useState<SimType>("fire_brick");
  const [rollouts, setRollouts] = useState(12);
  const [lineResult, setLineResult] = useState<SolveResult | null>(null);
  const [decks, setDecks] = useState<SavedDeck[]>([]);
  const [activeDeckId, setActiveDeckId] = useState("");
  const [decksHydrated, setDecksHydrated] = useState(false);
  const [isRenamingDeck, setIsRenamingDeck] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");
  const activeDeck =
    decks.find((deck) => deck.id === activeDeckId) ?? decks[0] ?? null;
  const deckText = activeDeck?.text ?? "";
  const deferredDeckText = useDeferredValue(deckText);
  const [samples, setSamples] = useState(8);
  const [deckResult, setDeckResult] = useState<DeckResult | null>(null);
  const [bounds, setBounds] = useState<OptimizeBounds>(makeBounds);
  const [deckSize, setDeckSize] = useState(60);
  const [deckAttempts, setDeckAttempts] = useState(32);
  const [ratioSamples, setRatioSamples] = useState(4);
  const [metric, setMetric] = useState<"mean" | "p50">("mean");
  const [ratioResult, setRatioResult] = useState<RatioResult | null>(null);
  const [ratioImportText, setRatioImportText] = useState("");
  const [progress, setProgress] = useState<OptimizeProgress | null>(null);
  const [busy, setBusy] = useState<JobType | null>(null);
  const [error, setError] = useState("");
  const [historyDeckFilter, setHistoryDeckFilter] = useState(false);
  const { startStreamingRun, cancel: cancelRun } = useRun();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await hydrateCardCatalogFromApi();
        const store = await loadDecksFromApi();
        if (cancelled) {
          return;
        }
        setDecks(store.decks);
        setActiveDeckId(store.activeDeckId);
        setDecksHydrated(true);
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load decks from the API.",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!decksHydrated || !activeDeckId) {
      return;
    }
    saveActiveDeckId(activeDeckId);
  }, [activeDeckId, decksHydrated]);

  useEffect(() => {
    if (!decksHydrated || !activeDeck) {
      return;
    }
    return scheduleDeckSave(activeDeck);
  }, [activeDeck, decksHydrated]);

  function updateActiveDeckText(text: string) {
    if (!activeDeck) {
      return;
    }
    setDecks((current) =>
      current.map((deck) =>
        deck.id === activeDeck.id ? { ...deck, text } : deck,
      ),
    );
    setDeckResult(null);
  }

  function switchDeck(deckId: string) {
    setActiveDeckId(deckId);
    setDeckResult(null);
    setError("");
    setIsRenamingDeck(false);
  }

  async function saveRatioDecklist(
    counts: DeckCounts,
    score: number,
    rank: number,
  ) {
    const lines = Object.entries(counts)
      .filter(([, count]) => count > 0)
      .sort((a, b) => {
        const byCount = b[1] - a[1];
        if (byCount !== 0) return byCount;
        const nameA = CARDS[a[0] as CardId]?.name ?? a[0];
        const nameB = CARDS[b[0] as CardId]?.name ?? b[0];
        return nameA.localeCompare(nameB);
      })
      .map(([id, count]) => `${count} ${CARDS[id as CardId]?.name ?? id}`);
    const text = `${lines.join("\n")}\n`;
    const name = nextDeckName(
      decks,
      `Ratio #${rank} · ${score.toFixed(2)}`,
    );
    try {
      const deck = await createDeckRemote(name, text);
      setDecks((current) => [...current, deck]);
      setActiveDeckId(deck.id);
      setError("");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Could not save the deck.",
      );
    }
  }

  async function createNewDeck() {
    try {
      const deck = await createDeckRemote(nextDeckName(decks), "");
      setDecks((current) => [...current, deck]);
      setActiveDeckId(deck.id);
      setDeckResult(null);
      setError("");
      setIsRenamingDeck(false);
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Could not create a deck.",
      );
    }
  }

  function startRenamingDeck() {
    if (!activeDeck) {
      return;
    }
    setRenameDraft(activeDeck.name);
    setIsRenamingDeck(true);
  }

  function commitDeckRename() {
    if (!activeDeck) {
      return;
    }
    const name = normalizeDeckName(renameDraft);
    setDecks((current) =>
      current.map((deck) =>
        deck.id === activeDeck.id ? { ...deck, name } : deck,
      ),
    );
    setIsRenamingDeck(false);
  }

  function cancelDeckRename() {
    setIsRenamingDeck(false);
    setRenameDraft("");
  }

  async function deleteActiveDeck() {
    if (!activeDeck) {
      return;
    }
    try {
      await deleteDeckRemote(activeDeck.id);
      if (decks.length === 1) {
        const deck = await createDeckRemote(nextDeckName([]), "");
        setDecks([deck]);
        setActiveDeckId(deck.id);
      } else {
        const remaining = decks.filter((deck) => deck.id !== activeDeck.id);
        setDecks(remaining);
        setActiveDeckId(remaining[0]?.id ?? "");
      }
      setDeckResult(null);
      setError("");
      setIsRenamingDeck(false);
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Could not delete the deck.",
      );
    }
  }

  async function solveHand() {
    if (hand.length < 2) {
      setError("Add at least two cards to solve a line.");
      return;
    }
    const needsDeck = simType !== "fire_brick";
    const deckCards = needsDeck ? parseDecklist(deckText) : [];
    if (needsDeck && deckCards.length < 7) {
      setError(
        "Monte Carlo and Two-pass need a maindeck (Deck damage tab) with at least seven cards.",
      );
      return;
    }
    const deck = needsDeck ? deckCountsCoveringHand(deckCards, hand) : undefined;
    setBusy("solve");
    setError("");
    try {
      const result = await apiSolve({
        hand,
        goFirst,
        maxTurns: turns,
        simType,
        rollouts,
        seed: 42 as unknown as bigint,
        ...(deck ? { deck } : {}),
      } as Parameters<typeof apiSolve>[0]);
      startTransition(() => setLineResult(result as unknown as SolveResult));
    } catch (solveError) {
      setError(
        solveError instanceof Error
          ? solveError.message
          : "The line solve failed.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function evaluateCurrentDeck() {
    const cards = parseDecklist(deferredDeckText);
    if (cards.length < 7) {
      setError("The decklist needs at least seven recognized cards.");
      return;
    }
    setBusy("evaluate");
    setError("");
    setProgress(null);
    try {
      await startStreamingRun(
        "evaluate",
        {
          deck: listToCounts(cards),
          samples,
          goFirst,
          maxTurns: turns,
          simType,
          rollouts,
          seed: makeSeed() as unknown as bigint,
        },
        activeDeck?.id,
        {
          onProgress: () => {},
          onComplete: (result) => {
            startTransition(() => setDeckResult(result as DeckResult));
            setBusy(null);
          },
          onError: (message) => {
            setError(message);
            setBusy(null);
          },
        },
      );
    } catch (evaluateError) {
      setError(
        evaluateError instanceof Error
          ? evaluateError.message
          : "Deck evaluation failed.",
      );
      setBusy(null);
    }
  }

  function applyRatioDecklist(text: string) {
    const cards = parseDecklist(text);
    if (cards.length < 7) {
      setError("Import a decklist with at least seven recognized cards.");
      return;
    }
    const counts = listToCounts(cards);
    const next = makeBounds();
    for (const id of PLAYABLE_CARD_IDS) {
      const count = Math.min(6, counts[id] ?? 0);
      next[id] = { min: count, max: count };
    }
    setBounds(next);
    setDeckSize(Math.min(60, Math.max(7, cards.length)));
    setRatioImportText(text);
    setError("");
  }

  async function optimizeCurrentBounds() {
    const min = Object.values(bounds).reduce((sum, item) => sum + item.min, 0);
    const max = Object.values(bounds).reduce((sum, item) => sum + item.max, 0);
    if (deckSize < min || deckSize > max) {
      setError(`Deck size must be between the bound totals (${min}–${max}).`);
      return;
    }
    const legal = countLegalDecklists(bounds, deckSize);
    if (legal === BigInt(0)) {
      setError("No legal lists exist for these bounds and deck size.");
      return;
    }
    const deckCount = Math.min(
      deckAttempts,
      MAX_RATIO_DECK_ATTEMPTS,
      Number(
        legal > BigInt(Number.MAX_SAFE_INTEGER)
          ? BigInt(MAX_RATIO_DECK_ATTEMPTS)
          : legal,
      ),
    );
    if (deckCount < 1) {
      setError("Choose at least one deck to attempt.");
      return;
    }
    setBusy("optimize");
    setError("");
    setProgress(null);
    try {
      await startStreamingRun(
        "optimize",
        {
          bounds,
          deckSize,
          samples: ratioSamples,
          decks: deckCount,
          metric,
          seed: makeSeed() as unknown as bigint,
        },
        undefined,
        {
          onProgress: (progressUpdate) => setProgress(progressUpdate),
          onComplete: (result) => {
            const ratio = result as RatioResult;
            startTransition(() => setRatioResult(ratio));
            setProgress((current) =>
              current
                ? {
                    ...current,
                    decksScored: current.totalDecks,
                    handsSimulated: current.totalHands,
                    bestScore: ratio.bestScore,
                  }
                : current,
            );
            setBusy(null);
          },
          onError: (message) => {
            setError(message);
            setBusy(null);
            setProgress(null);
          },
        },
      );
    } catch (optimizeError) {
      setError(
        optimizeError instanceof Error
          ? optimizeError.message
          : "Deck optimization failed.",
      );
      setBusy(null);
    }
  }

  function cancelJob() {
    void cancelRun();
    setBusy(null);
    setProgress(null);
    setError("Calculation cancelled.");
  }

  function sendSampleToHandSolver(sample: SampleHand) {
    setHand([...sample.hand]);
    setSimType(deckResult?.simType ?? simType);
    setLineResult({
      simType: deckResult?.simType ?? simType,
      maxDamage: sample.damage,
      steps: sample.steps,
      nodes: sample.nodes,
      distribution: sample.distribution,
      twoPass: sample.twoPass,
    });
    setTab("line");
    setError("");
  }

  const recognizedDeckCount = parseDecklist(deferredDeckText).length;
  const legalDecklists = countLegalDecklists(bounds, deckSize);
  const boundMinTotal = Object.values(bounds).reduce(
    (sum, item) => sum + item.min,
    0,
  );
  const boundMaxTotal = Object.values(bounds).reduce(
    (sum, item) => sum + item.max,
    0,
  );
  const freeCopies = Math.max(0, deckSize - boundMinTotal);
  const attemptCeiling =
    legalDecklists === BigInt(0)
      ? 0
      : Number(
          legalDecklists < BigInt(MAX_RATIO_DECK_ATTEMPTS)
            ? legalDecklists
            : BigInt(MAX_RATIO_DECK_ATTEMPTS),
        );
  const coveragePercent = deckAttemptPercent(deckAttempts, legalDecklists);

  useEffect(() => {
    if (attemptCeiling < 1) return;
    setDeckAttempts((current) =>
      Math.min(Math.max(1, current), attemptCeiling),
    );
  }, [attemptCeiling]);

  return (
    <main className="workbench">
      <header className="masthead">
        <div className="brand-lockup" aria-label="Fireline Grand Archive math">
          <span className="brand-mark">F</span>
          <div>
            <p>Grand Archive math</p>
            <h1>FIRELINE</h1>
          </div>
        </div>
      </header>

      <nav className="mode-switcher" aria-label="Calculator modes">
        {(
          [
            ["line", "Hand solver"],
            ["deck", "Deck damage"],
            ["ratios", "Ratio lab"],
            ["history", "History"],
          ] as const
        ).map(([id, label]) => (
          <button
            className={tab === id ? "active" : ""}
            key={id}
            onClick={() => {
              setTab(id);
              setError("");
            }}
          >
            {label}
          </button>
        ))}
      </nav>

      <section className="tool-plane">
        {tab === "line" && (
          <HandBuilder
            hand={hand}
            selectedCard={selectedCard}
            goFirst={goFirst}
            turns={turns}
            simType={simType}
            rollouts={rollouts}
            busy={busy === "solve"}
            onHandChange={setHand}
            onSelectedCardChange={setSelectedCard}
            onGoFirstChange={setGoFirst}
            onTurnsChange={setTurns}
            onSimTypeChange={(value) => {
              setSimType(value);
              setLineResult(null);
            }}
            onRolloutsChange={setRollouts}
            onSolve={solveHand}
            onCancel={cancelJob}
          />
        )}

        {tab === "line" && (
          <ResultRail result={lineResult} busy={busy === "solve"} />
        )}

        {tab === "deck" && (
          <DeckEditor
            decks={decks}
            activeDeck={activeDeck}
            deckText={deckText}
            recognizedDeckCount={recognizedDeckCount}
            isRenamingDeck={isRenamingDeck}
            renameDraft={renameDraft}
            samples={samples}
            goFirst={goFirst}
            turns={turns}
            simType={simType}
            rollouts={rollouts}
            busy={busy === "evaluate"}
            onSwitchDeck={switchDeck}
            onCreateDeck={createNewDeck}
            onStartRename={startRenamingDeck}
            onDeleteDeck={deleteActiveDeck}
            onRenameDraftChange={setRenameDraft}
            onCommitRename={commitDeckRename}
            onCancelRename={cancelDeckRename}
            onDeckTextChange={updateActiveDeckText}
            onSamplesChange={setSamples}
            onGoFirstChange={setGoFirst}
            onTurnsChange={setTurns}
            onSimTypeChange={(value) => {
              setSimType(value);
              setDeckResult(null);
            }}
            onRolloutsChange={setRollouts}
            onEvaluate={evaluateCurrentDeck}
            onCancel={cancelJob}
          />
        )}

        {tab === "deck" && (
          <DeckResults
            result={deckResult}
            busy={busy === "evaluate"}
            onSendToHandSolver={sendSampleToHandSolver}
          />
        )}

        {tab === "ratios" && (
          <div className="ratio-mode">
            <div className="ratio-topline">
              <p className="kicker">EXTENDED CARD POOL</p>
              <p>
                Sample unique legal lists inside your min/max rails, score each
                with opening-hand damage, and keep the top results.
              </p>
            </div>
            <RatioImportPanel
              ratioImportText={ratioImportText}
              activeDeck={activeDeck}
              onImportTextChange={setRatioImportText}
              onApply={() => applyRatioDecklist(ratioImportText)}
              onApplyActiveDeck={() => {
                if (activeDeck) {
                  applyRatioDecklist(activeDeck.text);
                }
              }}
              onResetBounds={() => {
                setBounds(makeBounds());
                setDeckSize(60);
                setError("");
              }}
            />
            <BoundsTable bounds={bounds} onBoundsChange={setBounds} />
            <PermutationPanel
              legalDecklists={legalDecklists}
              boundMinTotal={boundMinTotal}
              boundMaxTotal={boundMaxTotal}
              deckSize={deckSize}
              freeCopies={freeCopies}
              deckAttempts={deckAttempts}
              attemptCeiling={attemptCeiling}
              coveragePercent={coveragePercent}
              onDeckAttemptsChange={setDeckAttempts}
            />
            <RatioControls
              deckSize={deckSize}
              ratioSamples={ratioSamples}
              metric={metric}
              onDeckSizeChange={setDeckSize}
              onRatioSamplesChange={setRatioSamples}
              onMetricChange={setMetric}
            />
            <ActionBar
              label="Sample ratio space"
              busy={busy === "optimize"}
              onRun={optimizeCurrentBounds}
              onCancel={cancelJob}
              progress={progress}
            />
            <RatioResults
              result={ratioResult}
              onSaveDecklist={saveRatioDecklist}
            />
          </div>
        )}

        {tab === "history" && (
          <HistoryPanel
            activeDeck={activeDeck}
            filterToActiveDeck={historyDeckFilter}
            onFilterToActiveDeckChange={setHistoryDeckFilter}
          />
        )}

        {error && tab !== "history" && (
          <p className="error-banner" role="alert">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}
