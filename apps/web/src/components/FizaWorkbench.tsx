"use client";

import {
  startTransition,
  useDeferredValue,
  useEffect,
  useState,
} from "react";
import {
  CARDS,
  CARD_LIST,
  MAX_RATIO_DECK_ATTEMPTS,
  PLAYABLE_CARD_IDS,
  countLegalDecklists,
  deckAttemptPercent,
  formatDecklistCount,
  listToCounts,
  parseDecklist,
  type CardId,
  type DamageDistribution,
  type DeckCounts,
  type LineStep,
  type OptimizeBounds,
  type PassResult,
  type CardStat,
  type SimType,
  type SolveResult,
  type TwoPassResult,
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

type Tab = "line" | "deck" | "ratios";
type JobType = "solve" | "evaluate" | "optimize";

interface SampleHand {
  hand: CardId[];
  damage: number;
  steps: LineStep[];
  nodes: number;
  distribution?: DamageDistribution;
  twoPass?: TwoPassResult;
}

interface DeckResult {
  simType?: SimType;
  samples: number;
  damages: number[];
  hands: SampleHand[];
  mean: number;
  p50: number;
  p90: number;
  max: number;
  min: number;
  cardStats?: CardStat[];
}

const SIM_TYPE_LABELS: Record<SimType, string> = {
  fire_brick: "Fire brick",
  monte_carlo: "Monte Carlo — Sample",
  two_pass: "Two-pass",
};

interface RatioResult {
  bestCounts: DeckCounts;
  bestScore: number;
  top?: {
    rank: number;
    score: number;
    counts: DeckCounts;
  }[];
  history: { iteration: number; score: number }[];
}

function makeBounds(): OptimizeBounds {
  return Object.fromEntries(
    PLAYABLE_CARD_IDS.map((id) => [id, { min: 0, max: 4 }]),
  );
}

function makeSeed() {
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] >>> 0;
  }
  return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
}

/** Ensure opening-hand copies exist in the deck map so the engine can subtract them. */
function deckCountsCoveringHand(deckCards: CardId[], hand: CardId[]): DeckCounts {
  const counts = listToCounts(deckCards);
  const handCounts = listToCounts(hand);
  for (const [id, needed] of Object.entries(handCounts)) {
    const have = counts[id as CardId] ?? 0;
    if (have < needed) {
      counts[id as CardId] = needed;
    }
  }
  return counts;
}

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
    const decks = Math.min(
      deckAttempts,
      MAX_RATIO_DECK_ATTEMPTS,
      Number(legal > BigInt(Number.MAX_SAFE_INTEGER) ? BigInt(MAX_RATIO_DECK_ATTEMPTS) : legal),
    );
    if (decks < 1) {
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
          decks,
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
          <div className="mode-layout line-mode">
            <div className="controls">
              <div className="section-heading">
                <span>OPENING HAND</span>
                <strong>{hand.length} cards</strong>
              </div>
              <div className="hand-strip" aria-label="Selected opening hand">
                {hand.map((id, index) => (
                  <button
                    className={`card-tile is-${CARDS[id].element}`}
                    key={`${id}-${index}`}
                    onClick={() =>
                      setHand((current) =>
                        current.filter((_, itemIndex) => itemIndex !== index),
                      )
                    }
                    title="Remove card"
                  >
                    <span>{CARDS[id].element === "fire" ? "FIRE" : "NORM"}</span>
                    <b>{CARDS[id].name}</b>
                    <small>
                      {CARDS[id].cost}R · {CARDS[id].kind}
                    </small>
                  </button>
                ))}
                {hand.length === 0 && (
                  <p className="empty-note">Choose cards below to build a hand.</p>
                )}
              </div>

              <div className="add-card-row">
                <label>
                  Add card
                  <select
                    value={selectedCard}
                    onChange={(event) =>
                      setSelectedCard(event.target.value as CardId)
                    }
                  >
                    {CARD_LIST.filter((card) => card.id !== "brick").map(
                      (card) => (
                        <option key={card.id} value={card.id}>
                          {card.name}
                        </option>
                      ),
                    )}
                  </select>
                </label>
                <button
                  className="secondary-action"
                  onClick={() =>
                    setHand((current) =>
                      current.length < 8
                        ? [...current, selectedCard]
                        : current,
                    )
                  }
                >
                  Add to hand
                </button>
                <button
                  className="text-action"
                  onClick={() => setHand(DRILL_3_HAND)}
                >
                  Load drill #3
                </button>
              </div>
              <RunSettings
                goFirst={goFirst}
                turns={turns}
                simType={simType}
                rollouts={rollouts}
                onFirstChange={setGoFirst}
                onTurnsChange={setTurns}
                onSimTypeChange={(value) => {
                  setSimType(value);
                  setLineResult(null);
                }}
                onRolloutsChange={setRollouts}
              />
              <ActionBar
                label="Calculate maximum damage"
                busy={busy === "solve"}
                onRun={solveHand}
                onCancel={cancelJob}
              />
            </div>
          </div>
        )}

        {tab === "line" && (
          <ResultRail result={lineResult} busy={busy === "solve"} />
        )}

        {tab === "deck" && (
          <div className="mode-layout line-mode">
            <div className="controls">
              <div className="section-heading">
                <span>DECKLIST</span>
                <strong>{recognizedDeckCount} recognized</strong>
              </div>
              <div className="deck-toolbar">
                <label className="deck-picker">
                  Saved deck
                  <select
                    value={activeDeck?.id ?? ""}
                    onChange={(event) => switchDeck(event.target.value)}
                    disabled={decks.length === 0}
                  >
                    {decks.map((deck) => (
                      <option key={deck.id} value={deck.id}>
                        {deck.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="deck-toolbar-actions">
                  <button
                    className="secondary-action"
                    type="button"
                    onClick={createNewDeck}
                  >
                    New deck
                  </button>
                  <button
                    className="text-action"
                    type="button"
                    onClick={startRenamingDeck}
                    disabled={!activeDeck}
                  >
                    Rename
                  </button>
                  <button
                    className="text-action is-danger"
                    type="button"
                    onClick={deleteActiveDeck}
                    disabled={!activeDeck}
                  >
                    Delete
                  </button>
                </div>
              </div>
              {isRenamingDeck && activeDeck && (
                <form
                  className="deck-rename-row"
                  onSubmit={(event) => {
                    event.preventDefault();
                    commitDeckRename();
                  }}
                >
                  <label>
                    Deck name
                    <input
                      autoFocus
                      value={renameDraft}
                      onChange={(event) => setRenameDraft(event.target.value)}
                    />
                  </label>
                  <button className="secondary-action" type="submit">
                    Save name
                  </button>
                  <button
                    className="text-action"
                    type="button"
                    onClick={cancelDeckRename}
                  >
                    Cancel
                  </button>
                </form>
              )}
              <label className="deck-input">
                One card per line, with quantity
                <textarea
                  value={deckText}
                  onChange={(event) => updateActiveDeckText(event.target.value)}
                  spellCheck={false}
                />
              </label>
              <div className="settings-row">
                <label>
                  Opening hands
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={samples}
                    onChange={(event) => setSamples(Number(event.target.value))}
                  />
                </label>
              </div>
              <RunSettings
                goFirst={goFirst}
                turns={turns}
                simType={simType}
                rollouts={rollouts}
                onFirstChange={setGoFirst}
                onTurnsChange={setTurns}
                onSimTypeChange={(value) => {
                  setSimType(value);
                  setDeckResult(null);
                }}
                onRolloutsChange={setRollouts}
              />
              <ActionBar
                label="Sample deck damage"
                busy={busy === "evaluate"}
                onRun={evaluateCurrentDeck}
                onCancel={cancelJob}
              />
            </div>
          </div>
        )}

        {tab === "deck" && (
          <DeckResults
            result={deckResult}
            busy={busy === "evaluate"}
            onSendToHandSolver={(sample) => {
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
            }}
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
            <div className="ratio-import">
              <div className="section-heading">
                <span>IMPORT DECKLIST</span>
                <strong>
                  {parseDecklist(ratioImportText).length} recognized
                </strong>
              </div>
              <label className="deck-input ratio-import-input">
                Paste a list to lock min = max for each card
                <textarea
                  value={ratioImportText}
                  onChange={(event) => setRatioImportText(event.target.value)}
                  placeholder={`4 Arthur, Young Heir\n3 Ignited Stab\n…`}
                  spellCheck={false}
                />
              </label>
              <div className="ratio-import-actions">
                <button
                  type="button"
                  className="secondary-action"
                  onClick={() => applyRatioDecklist(ratioImportText)}
                >
                  Apply to bounds
                </button>
                {activeDeck && (
                  <button
                    type="button"
                    className="text-action"
                    onClick={() => applyRatioDecklist(activeDeck.text)}
                  >
                    Use “{activeDeck.name}”
                  </button>
                )}
                <button
                  type="button"
                  className="text-action"
                  onClick={() => {
                    setBounds(makeBounds());
                    setDeckSize(60);
                    setError("");
                  }}
                >
                  Reset bounds
                </button>
              </div>
            </div>
            <div className="bounds-table">
              <div className="bounds-head">
                <span>Card</span>
                <span>Minimum</span>
                <span>Maximum</span>
              </div>
              {[...PLAYABLE_CARD_IDS]
                .sort((a, b) => CARDS[a].name.localeCompare(CARDS[b].name))
                .map((id) => (
                <div className="bounds-row" key={id}>
                  <span>
                    <b>{CARDS[id].name}</b>
                    <small>{CARDS[id].kind}</small>
                  </span>
                  <input
                    aria-label={`${CARDS[id].name} minimum`}
                    type="number"
                    min={0}
                    max={bounds[id].max}
                    value={bounds[id].min}
                    onChange={(event) =>
                      setBounds((current) => ({
                        ...current,
                        [id]: {
                          ...current[id],
                          min: Number(event.target.value),
                        },
                      }))
                    }
                  />
                  <input
                    aria-label={`${CARDS[id].name} maximum`}
                    type="number"
                    min={bounds[id].min}
                    max={6}
                    value={bounds[id].max}
                    onChange={(event) =>
                      setBounds((current) => ({
                        ...current,
                        [id]: {
                          ...current[id],
                          max: Number(event.target.value),
                        },
                      }))
                    }
                  />
                </div>
              ))}
            </div>
            <div className="permutation-panel">
              <div className="permutation-meta">
                <span>LEGAL LISTS</span>
                <strong>{formatDecklistCount(legalDecklists)}</strong>
                <small>
                  Bounds {boundMinTotal}–{boundMaxTotal} · deck {deckSize} ·{" "}
                  {freeCopies} free{" "}
                  {freeCopies === 1 ? "copy" : "copies"}
                </small>
                <small>
                  {legalDecklists === BigInt(0)
                    ? "Deck size is outside the bound totals"
                    : freeCopies === 0
                      ? "Minimums already fill the deck — lower some mins (and raise other maxes) to open the space"
                      : legalDecklists === BigInt(1)
                        ? "Only one mix fits — widen gaps on more than one card"
                        : legalDecklists > BigInt(MAX_RATIO_DECK_ATTEMPTS)
                          ? `Showing a unique sample · browser cap ${MAX_RATIO_DECK_ATTEMPTS}`
                          : "Space is small enough to cover fully"}
                </small>
              </div>
              <div
                className="permutation-track"
                aria-label={`${deckAttempts} of ${formatDecklistCount(legalDecklists)} lists · ${coveragePercent.toFixed(2)}% of full space`}
              >
                <span style={{ width: `${coveragePercent}%` }} />
              </div>
              <label className="permutation-slider">
                <span>
                  Decks to try · {deckAttempts}
                  {attemptCeiling > 0 ? ` / ${attemptCeiling}` : ""}
                  {" · "}
                  {coveragePercent < 0.01 && deckAttempts > 0
                    ? "<0.01"
                    : coveragePercent.toFixed(2)}
                  % of legal
                </span>
                <input
                  type="range"
                  min={1}
                  max={Math.max(1, attemptCeiling)}
                  value={Math.min(deckAttempts, Math.max(1, attemptCeiling))}
                  disabled={attemptCeiling < 1}
                  onChange={(event) =>
                    setDeckAttempts(Number(event.target.value))
                  }
                />
              </label>
            </div>
            <div className="ratio-controls">
              <label>
                Deck size
                <input
                  type="number"
                  min={7}
                  max={60}
                  value={deckSize}
                  onChange={(event) => setDeckSize(Number(event.target.value))}
                />
              </label>
              <label>
                Hands / list
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={ratioSamples}
                  onChange={(event) =>
                    setRatioSamples(Number(event.target.value))
                  }
                />
              </label>
              <label>
                Optimize
                <select
                  value={metric}
                  onChange={(event) =>
                    setMetric(event.target.value as "mean" | "p50")
                  }
                >
                  <option value="mean">Mean damage</option>
                  <option value="p50">Median damage</option>
                </select>
              </label>
            </div>
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

        {error && (
          <p className="error-banner" role="alert">
            {error}
          </p>
        )}
      </section>

    </main>
  );
}

function RunSettings({
  goFirst,
  turns,
  simType,
  rollouts,
  onFirstChange,
  onTurnsChange,
  onSimTypeChange,
  onRolloutsChange,
}: {
  goFirst: boolean;
  turns: number;
  simType: SimType;
  rollouts: number;
  onFirstChange: (value: boolean) => void;
  onTurnsChange: (value: number) => void;
  onSimTypeChange: (value: SimType) => void;
  onRolloutsChange: (value: number) => void;
}) {
  return (
    <div className="settings-stack">
      <div className="settings-row">
        <label>
          Turn order
          <select
            value={goFirst ? "first" : "second"}
            onChange={(event) => onFirstChange(event.target.value === "first")}
          >
            <option value="first">Going first</option>
            <option value="second">Going second</option>
          </select>
        </label>
        <label>
          Turn horizon
          <select
            value={turns}
            onChange={(event) => onTurnsChange(Number(event.target.value))}
          >
            <option value={2}>2 turns</option>
            <option value={3}>3 turns</option>
          </select>
        </label>
      </div>
      <div className="settings-row">
        <label>
          Simulation type
          <select
            value={simType}
            onChange={(event) =>
              onSimTypeChange(event.target.value as SimType)
            }
          >
            <option value="fire_brick">Fire brick (default)</option>
            <option value="monte_carlo">Monte Carlo — Sample</option>
            <option value="two_pass">Two-pass</option>
          </select>
        </label>
        {simType === "monte_carlo" && (
          <label>
            Rollouts
            <input
              type="number"
              min={1}
              max={48}
              value={rollouts}
              onChange={(event) =>
                onRolloutsChange(Number(event.target.value))
              }
            />
          </label>
        )}
      </div>
      {simType !== "fire_brick" && (
        <p className="sim-hint">
          Uses the maindeck from the Deck damage tab so unknown draws can be
          sampled.
        </p>
      )}
    </div>
  );
}

function ActionBar({
  label,
  busy,
  onRun,
  onCancel,
  progress,
}: {
  label: string;
  busy: boolean;
  onRun: () => void;
  onCancel: () => void;
  progress?: OptimizeProgress | null;
}) {
  const percent =
    progress && progress.totalHands > 0
      ? Math.min(
          100,
          Math.round((progress.handsSimulated / progress.totalHands) * 100),
        )
      : progress && progress.totalDecks > 0
        ? Math.min(
            100,
            Math.round((progress.decksScored / progress.totalDecks) * 100),
          )
        : 0;

  return (
    <div className="action-bar">
      <div className="action-bar-controls">
        <button className="primary-action" onClick={onRun} disabled={busy}>
          {busy ? "Calculating…" : label}
          <span aria-hidden>→</span>
        </button>
        {busy && (
          <button className="text-action" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
      {busy && progress && (
        <div
          className="progress-panel"
          aria-label={`${percent}% complete`}
        >
          <div className="progress-meta">
            <span>
              {progress.decksScored.toLocaleString()} /{" "}
              {progress.totalDecks.toLocaleString()} decks
            </span>
            <span>
              {progress.handsSimulated.toLocaleString()} /{" "}
              {progress.totalHands.toLocaleString()} hands
            </span>
            <span>
              {progress.legalDecks.toLocaleString()} legal
            </span>
            <span>best {progress.bestScore.toFixed(2)}</span>
          </div>
          <div className="progress-track">
            <span style={{ width: `${percent}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}

function ResultRail({
  result,
  busy,
}: {
  result: SolveResult | null;
  busy: boolean;
}) {
  const [mcIndex, setMcIndex] = useState<number | null>(null);

  useEffect(() => {
    setMcIndex(null);
  }, [result]);

  if (!result) {
    return (
      <aside className="result-rail" aria-live="polite">
        <div className="damage-readout">
          <span>MAX DAMAGE</span>
          <strong className={busy ? "calculating" : ""}>—</strong>
          <small>Run a hand to reveal the line</small>
        </div>
      </aside>
    );
  }

  const mode = result.simType ?? "fire_brick";

  if (mode === "monte_carlo" && result.distribution) {
    return (
      <MonteCarloResult
        distribution={result.distribution}
        nodes={result.nodes}
        busy={busy}
        selected={mcIndex}
        onSelect={setMcIndex}
        cardStats={result.cardStats}
      />
    );
  }

  if (mode === "two_pass" && result.twoPass) {
    return (
      <TwoPassResultView
        twoPass={result.twoPass}
        nodes={result.nodes}
        busy={busy}
        cardStats={result.cardStats}
      />
    );
  }

  return (
    <aside className="result-rail" aria-live="polite">
      <div className="damage-readout">
        <span>MAX DAMAGE</span>
        <strong className={busy ? "calculating" : ""}>
          {result.maxDamage}
        </strong>
        <small>
          {SIM_TYPE_LABELS[mode]} · {result.nodes.toLocaleString()} states
          searched
        </small>
      </div>
      {result.cardStats && result.cardStats.length > 0 && (
        <CardStatsPanel stats={result.cardStats} samples={1} mode={mode} />
      )}
      <div className="combat-tape">
        <div className="tape-heading">
          <span>OPTIMAL LINE</span>
          <span>{result.steps.length} steps</span>
        </div>
        <CombatTape steps={result.steps} resetKey={result} />
      </div>
    </aside>
  );
}

function McRangeColumn({
  min,
  max,
  p50,
  scaleMax,
  selected,
  title,
  onClick,
}: {
  min: number;
  max: number;
  p50: number;
  scaleMax: number;
  selected?: boolean;
  title: string;
  onClick: () => void;
}) {
  const whiskerBottom = (min / scaleMax) * 100;
  const whiskerHeight = Math.max(((max - min) / scaleMax) * 100, 1.5);

  return (
    <button
      type="button"
      className={`mc-range-col ${selected ? "is-selected" : ""}`}
      title={title}
      aria-pressed={selected}
      onClick={onClick}
    >
      <span className="mc-range-track">
        <span
          className="mc-whisker"
          style={{ bottom: `${whiskerBottom}%`, height: `${whiskerHeight}%` }}
        />
        <span
          className="mc-fill"
          style={{ height: `${Math.max(8, (p50 / scaleMax) * 100)}%` }}
        />
      </span>
    </button>
  );
}

function MonteCarloResult({
  distribution,
  nodes,
  busy,
  selected,
  onSelect,
  cardStats,
}: {
  distribution: DamageDistribution;
  nodes: number;
  busy: boolean;
  selected: number | null;
  onSelect: (index: number | null) => void;
  cardStats?: CardStat[];
}) {
  const scaleMax = Math.max(distribution.max, 1);
  const rollout =
    selected !== null ? (distribution.rollouts[selected] ?? null) : null;

  return (
    <aside className="result-rail" aria-live="polite">
      <div className="damage-readout">
        <span>P50 DAMAGE</span>
        <strong className={busy ? "calculating" : ""}>{distribution.p50}</strong>
        <small>
          Monte Carlo · {distribution.min}–{distribution.max} range ·{" "}
          {nodes.toLocaleString()} states
        </small>
      </div>
      <div className="stat-line">
        <span>
          <small>MEAN</small>
          <b>{distribution.mean.toFixed(1)}</b>
        </span>
        <span>
          <small>P90</small>
          <b>{distribution.p90}</b>
        </span>
        <span>
          <small>RANGE</small>
          <b>
            {distribution.min}–{distribution.max}
          </b>
        </span>
      </div>
      {cardStats && cardStats.length > 0 && (
        <CardStatsPanel
          stats={cardStats}
          samples={distribution.damages.length}
          mode="monte_carlo"
        />
      )}
      <div className="damage-bars" aria-label="Monte Carlo rollout damages">
        {distribution.damages.map((damage, index) => (
          <button
            type="button"
            className={selected === index ? "is-selected" : undefined}
            key={`mc-${damage}-${index}`}
            style={{ height: `${Math.max(8, (damage / scaleMax) * 100)}%` }}
            title={`Rollout ${index + 1}: ${damage} damage`}
            aria-pressed={selected === index}
            onClick={() =>
              onSelect(selected === index ? null : index)
            }
          />
        ))}
      </div>
      {rollout && (
        <div className="combat-tape">
          <div className="tape-heading">
            <span>
              ROLLOUT {selected! + 1} · {rollout.damage} DAMAGE
            </span>
            <span>{rollout.steps.length} steps</span>
          </div>
          <CombatTape
            steps={rollout.steps}
            resetKey={`mc-${selected}-${rollout.damage}`}
          />
        </div>
      )}
    </aside>
  );
}

function TwoPassResultView({
  twoPass,
  nodes,
  busy,
  cardStats,
}: {
  twoPass: TwoPassResult;
  nodes: number;
  busy: boolean;
  cardStats?: CardStat[];
}) {
  return (
    <aside className="result-rail two-pass-rail" aria-live="polite">
      <div className="damage-readout">
        <span>TWO-PASS</span>
        <strong className={busy ? "calculating" : ""}>
          {twoPass.brick.maxDamage}
          <span className="damage-split">/</span>
          {twoPass.oracle.maxDamage}
        </strong>
        <small>
          Brick / Oracle · {nodes.toLocaleString()} states searched
        </small>
      </div>
      {cardStats && cardStats.length > 0 && (
        <CardStatsPanel stats={cardStats} samples={1} mode="two_pass" />
      )}
      <TwoPassCompare
        brick={twoPass.brick}
        oracle={twoPass.oracle}
        resetKey={`${twoPass.brick.maxDamage}-${twoPass.oracle.maxDamage}-${twoPass.brick.steps.length}`}
      />
    </aside>
  );
}

function DeckResults({
  result,
  busy,
  onSendToHandSolver,
}: {
  result: DeckResult | null;
  busy: boolean;
  onSendToHandSolver: (sample: SampleHand) => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [mcIndex, setMcIndex] = useState<number | null>(null);

  useEffect(() => {
    setSelected(null);
    setMcIndex(null);
  }, [result]);

  if (!result) {
    return (
      <aside className="result-rail">
        <div className="damage-readout">
          <span>EXPECTED DAMAGE</span>
          <strong className={busy ? "calculating" : ""}>—</strong>
          <small>Sample opening hands to build the distribution</small>
        </div>
      </aside>
    );
  }

  const mode = result.simType ?? "fire_brick";
  const isTwoPass = mode === "two_pass";
  const isMonteCarlo = mode === "monte_carlo";
  const twoPassPairs = result.hands.map((hand) => ({
    brick: hand.twoPass?.brick.maxDamage ?? hand.damage,
    oracle: hand.twoPass?.oracle.maxDamage ?? hand.damage,
  }));
  const mcRanges = result.hands.map((hand) => ({
    min: hand.distribution?.min ?? hand.damage,
    max: hand.distribution?.max ?? hand.damage,
    p50: hand.distribution?.p50 ?? hand.damage,
  }));
  const max = isTwoPass
    ? Math.max(1, ...twoPassPairs.flatMap((pair) => [pair.brick, pair.oracle]))
    : isMonteCarlo
      ? Math.max(1, ...mcRanges.map((range) => range.max))
      : Math.max(...result.damages, 1);
  const brickMean = isTwoPass
    ? twoPassPairs.reduce((sum, pair) => sum + pair.brick, 0) /
      Math.max(twoPassPairs.length, 1)
    : result.mean;
  const oracleMean = isTwoPass
    ? twoPassPairs.reduce((sum, pair) => sum + pair.oracle, 0) /
      Math.max(twoPassPairs.length, 1)
    : result.mean;
  const sample =
    selected !== null ? (result.hands?.[selected] ?? null) : null;

  return (
    <aside className="result-rail" aria-live="polite">
      <div className="damage-readout">
        <span>{isTwoPass ? "BRICK / ORACLE MEAN" : "MEAN DAMAGE"}</span>
        <strong>
          {isTwoPass ? (
            <>
              {brickMean.toFixed(1)}
              <span className="damage-split">/</span>
              {oracleMean.toFixed(1)}
            </>
          ) : (
            result.mean.toFixed(1)
          )}
        </strong>
        <small>
          {SIM_TYPE_LABELS[mode]} · {result.samples} opening hands · click a
          bar for the line
        </small>
      </div>
      {isTwoPass ? (
        <div className="stat-line">
          <span>
            <small>BRICK RANGE</small>
            <b>
              {Math.min(...twoPassPairs.map((p) => p.brick))}–
              {Math.max(...twoPassPairs.map((p) => p.brick))}
            </b>
          </span>
          <span>
            <small>ORACLE RANGE</small>
            <b>
              {Math.min(...twoPassPairs.map((p) => p.oracle))}–
              {Math.max(...twoPassPairs.map((p) => p.oracle))}
            </b>
          </span>
          <span>
            <small>GAP MEAN</small>
            <b>
              {(oracleMean - brickMean).toFixed(1)}
            </b>
          </span>
        </div>
      ) : (
        <div className="stat-line">
          <span>
            <small>P50</small>
            <b>{result.p50}</b>
          </span>
          <span>
            <small>P90</small>
            <b>{result.p90}</b>
          </span>
          <span>
            <small>RANGE</small>
            <b>
              {result.min}–{result.max}
            </b>
          </span>
        </div>
      )}
      {isTwoPass && (
        <div className="bar-legend" aria-hidden>
          <span className="is-brick">Fire brick</span>
          <span className="is-oracle">Oracle</span>
        </div>
      )}
      {result.cardStats && result.cardStats.length > 0 && (
        <CardStatsPanel
          stats={result.cardStats}
          samples={result.samples}
          mode={mode}
        />
      )}
      <div
        className={`damage-bars ${isTwoPass ? "is-two-pass" : ""} ${isMonteCarlo ? "is-monte-carlo" : ""}`}
        aria-label={
          isTwoPass
            ? "Two-pass brick and oracle damage by opening hand"
            : isMonteCarlo
              ? "Monte Carlo P50 damage with min–max range"
              : "Sample damage distribution"
        }
      >
        {isTwoPass
          ? twoPassPairs.map((pair, index) => (
              <button
                type="button"
                className={`bar-pair ${selected === index ? "is-selected" : ""}`}
                key={`two-pass-${pair.brick}-${pair.oracle}-${index}`}
                title={`Hand ${index + 1}: brick ${pair.brick} / oracle ${pair.oracle}`}
                aria-pressed={selected === index}
                onClick={() => {
                  setSelected((current) => (current === index ? null : index));
                  setMcIndex(null);
                }}
              >
                <span
                  className="bar-pair-brick"
                  style={{
                    height: `${Math.max(8, (pair.brick / max) * 100)}%`,
                  }}
                />
                <span
                  className="bar-pair-oracle"
                  style={{
                    height: `${Math.max(8, (pair.oracle / max) * 100)}%`,
                  }}
                />
              </button>
            ))
          : isMonteCarlo
            ? mcRanges.map((range, index) => (
                <McRangeColumn
                  key={`mc-range-${range.min}-${range.max}-${index}`}
                  min={range.min}
                  max={range.max}
                  p50={range.p50}
                  scaleMax={max}
                  selected={selected === index}
                  title={`Hand ${index + 1}: P50 ${range.p50} (${range.min}–${range.max})`}
                  onClick={() => {
                    setSelected((current) =>
                      current === index ? null : index,
                    );
                    setMcIndex(null);
                  }}
                />
              ))
            : result.damages.map((damage, index) => (
                <button
                  type="button"
                  className={selected === index ? "is-selected" : undefined}
                  key={`${damage}-${index}`}
                  style={{ height: `${Math.max(8, (damage / max) * 100)}%` }}
                  title={`Hand ${index + 1}: ${damage} damage`}
                  aria-pressed={selected === index}
                  onClick={() => {
                    setSelected((current) =>
                      current === index ? null : index,
                    );
                    setMcIndex(null);
                  }}
                />
              ))}
      </div>

      {sample && (
        <div className="sample-detail">
          <div className="section-heading">
            <span>
              HAND {selected! + 1} ·{" "}
              {sample.twoPass
                ? `${sample.twoPass.brick.maxDamage} / ${sample.twoPass.oracle.maxDamage} DAMAGE`
                : sample.distribution
                  ? `${sample.distribution.min}–${sample.distribution.max} (P50 ${sample.distribution.p50})`
                  : `${sample.damage} DAMAGE`}
            </span>
            <strong>{sample.nodes.toLocaleString()} states</strong>
          </div>
          <div className="hand-strip sample-hand" aria-label="Sampled opening hand">
            {sample.hand.map((id, index) => (
              <div
                className={`card-tile is-${CARDS[id]?.element ?? "norm"}`}
                key={`${id}-${index}`}
              >
                <span>
                  {CARDS[id]?.element === "fire" ? "FIRE" : "NORM"}
                </span>
                <b>{CARDS[id]?.name ?? id}</b>
                <small>
                  {CARDS[id]?.cost ?? "?"}R · {CARDS[id]?.kind ?? "card"}
                </small>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="secondary-action send-to-solver"
            onClick={() => onSendToHandSolver(sample)}
          >
            Send to hand solver
          </button>

          {mode === "monte_carlo" && sample.distribution && (
            <MonteCarloSampleDetail
              distribution={sample.distribution}
              selected={mcIndex}
              onSelect={setMcIndex}
            />
          )}

          {mode === "two_pass" && sample.twoPass && (
            <TwoPassCompare
              brick={sample.twoPass.brick}
              oracle={sample.twoPass.oracle}
              compact
              resetKey={`deck-two-pass-${selected}`}
            />
          )}

          {mode === "fire_brick" && (
            <div className="combat-tape">
              <div className="tape-heading">
                <span>OPTIMAL LINE</span>
                <span>{sample.steps.length} steps</span>
              </div>
              <CombatTape
                steps={sample.steps}
                resetKey={`${selected}-${sample.damage}-${sample.nodes}`}
              />
            </div>
          )}
        </div>
      )}
    </aside>
  );
}

function MonteCarloSampleDetail({
  distribution,
  selected,
  onSelect,
}: {
  distribution: DamageDistribution;
  selected: number | null;
  onSelect: (index: number | null) => void;
}) {
  const scaleMax = Math.max(distribution.max, 1);
  const rollout =
    selected !== null ? (distribution.rollouts[selected] ?? null) : null;

  return (
    <div className="mc-sample-block">
      <div className="damage-bars short" aria-label="Hand rollouts">
        {distribution.damages.map((damage, index) => (
          <button
            type="button"
            className={selected === index ? "is-selected" : undefined}
            key={`sample-mc-${damage}-${index}`}
            style={{ height: `${Math.max(8, (damage / scaleMax) * 100)}%` }}
            title={`Rollout ${index + 1}: ${damage}`}
            aria-pressed={selected === index}
            onClick={() =>
              onSelect(selected === index ? null : index)
            }
          />
        ))}
      </div>
      {rollout && (
        <div className="combat-tape">
          <div className="tape-heading">
            <span>
              ROLLOUT {selected! + 1} · {rollout.damage} DAMAGE
            </span>
            <span>{rollout.steps.length} steps</span>
          </div>
          <CombatTape
            steps={rollout.steps}
            resetKey={`sample-mc-${selected}-${rollout.damage}`}
          />
        </div>
      )}
    </div>
  );
}

function TwoPassCompare({
  brick,
  oracle,
  resetKey,
  compact,
}: {
  brick: PassResult;
  oracle: PassResult;
  resetKey: string;
  compact?: boolean;
}) {
  const diff = twoPassStepDiff(brick.steps, oracle.steps);
  const oracleDiffCount = diff.oracle.filter(
    (entry) => entry.mark === "added",
  ).length;

  return (
    <div className={`pass-stack ${compact ? "compact" : ""}`}>
      {oracleDiffCount > 0 && (
        <p className="pass-diff-note">
          {oracleDiffCount} oracle step{oracleDiffCount === 1 ? "" : "s"} differ
          from fire brick — highlighted below
        </p>
      )}
      <PassLinePanel
        label="Fire brick"
        damage={brick.maxDamage}
        steps={brick.steps}
        resetKey={`${resetKey}-brick`}
        stepDiff={diff.brick}
        note="Unknown draws stay blank (no peek)."
      />
      <PassLinePanel
        label="Oracle"
        damage={oracle.maxDamage}
        steps={oracle.steps}
        resetKey={`${resetKey}-oracle`}
        stepDiff={diff.oracle}
        oracle
        note="One shuffled remaining deck is known."
      />
    </div>
  );
}

function PassLinePanel({
  label,
  damage,
  steps,
  resetKey,
  stepDiff,
  note,
  oracle,
}: {
  label: string;
  damage: number;
  steps: LineStep[];
  resetKey: string;
  stepDiff?: StepDiffInfo[];
  note?: string;
  oracle?: boolean;
}) {
  const diffCount =
    stepDiff?.filter((entry) => entry.mark !== "same").length ?? 0;

  return (
    <div className={`pass-panel ${oracle ? "is-oracle" : ""}`}>
      <div className="pass-heading">
        <span>{label.toUpperCase()}</span>
        <strong>{damage}</strong>
      </div>
      {note && <p className="pass-note">{note}</p>}
      <div className="combat-tape">
        <div className="tape-heading">
          <span>{label.toUpperCase()} LINE</span>
          <span>
            {steps.length} steps
            {diffCount > 0 && oracle && (
              <em className="tape-diff-count"> · {diffCount} diffs</em>
            )}
          </span>
        </div>
        <CombatTape
          steps={steps}
          resetKey={resetKey}
          stepDiff={oracle ? stepDiff : undefined}
          diffPerspective={oracle ? "oracle" : undefined}
        />
      </div>
    </div>
  );
}

function CardStatsPanel({
  stats,
  samples,
  mode,
}: {
  stats: CardStat[];
  samples: number;
  mode: SimType;
}) {
  const fmtPct = (value: number) => `${(value * 100).toFixed(0)}%`;
  const fmtNum = (value: number) =>
    Number.isInteger(value) ? String(value) : value.toFixed(1);

  return (
    <details className="card-stats">
      <summary>
        <span>Deck stats</span>
        <small>
          {stats.length} cards · {samples}{" "}
          {mode === "monte_carlo" && samples > 1 ? "rollouts" : "samples"}
        </small>
      </summary>
      <p className="card-stats-note">
        Rates are normalised by how often each card was opened or drawn on the
        optimal line. Play when seen = plays ÷ samples where the card appeared.
      </p>
      <div className="card-stats-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Card</th>
              <th title="Copies in deck / hand">N</th>
              <th title="Opened in starting hand">Open</th>
              <th title="Seen (opened or drawn mid-line)">Seen</th>
              <th title="Times played from hand">Play</th>
              <th title="Ally attacks">Atk</th>
              <th title="Damage attributed on the line">Dmg</th>
              <th title="Plays per sample where seen">Play|seen</th>
              <th title="Mean damage when seen">Dmg|seen</th>
              <th title="Share of attributed damage">Share</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((row) => (
              <tr key={row.card}>
                <td>
                  <b>{row.name}</b>
                </td>
                <td>{row.copies}</td>
                <td>{fmtPct(row.openRate)}</td>
                <td>{fmtPct(row.seeRate)}</td>
                <td>{row.plays}</td>
                <td>{row.attacks}</td>
                <td>{row.damage}</td>
                <td>{fmtNum(row.playWhenSeen)}</td>
                <td>{fmtNum(row.damageWhenSeen)}</td>
                <td>{fmtPct(row.damageShare)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function RatioResults({
  result,
  onSaveDecklist,
}: {
  result: RatioResult | null;
  onSaveDecklist: (counts: DeckCounts, score: number, rank: number) => void;
}) {
  if (!result) return null;

  const top =
    result.top && result.top.length > 0
      ? result.top
      : [
          {
            rank: 1,
            score: result.bestScore,
            counts: result.bestCounts,
          },
        ];

  return (
    <section className="ratio-results" aria-live="polite">
      <div className="ratio-results-lead">
        <span>BEST SCORE</span>
        <strong>{result.bestScore.toFixed(2)}</strong>
        <small>Top {top.length} distinct lists</small>
      </div>
      <ol className="ratio-rankings">
        {top.map((entry) => (
          <li key={`rank-${entry.rank}-${entry.score}`}>
            <header>
              <span>#{entry.rank}</span>
              <strong>{entry.score.toFixed(2)}</strong>
            </header>
            <ul>
              {Object.entries(entry.counts)
                .filter(([, count]) => count > 0)
                .sort((a, b) => b[1] - a[1])
                .map(([id, count]) => (
                  <li key={`${entry.rank}-${id}`}>
                    <b>{count}×</b>
                    <span>{CARDS[id as CardId]?.name ?? id}</span>
                  </li>
                ))}
            </ul>
            <button
              type="button"
              className="ratio-save-deck"
              onClick={() =>
                onSaveDecklist(entry.counts, entry.score, entry.rank)
              }
            >
              Save decklist
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

const PHASE_LABELS: Record<string, string> = {
  Main: "Main",
  Mate: "Materialize",
  Reco: "Recollect",
  Agil: "Agility",
  End: "End",
  EMai: "Enemy Main",
  EEnd: "Enemy End",
  Wake: "Wake",
};

type StepDiffMark = "same" | "added" | "removed";

interface StepDiffInfo {
  mark: StepDiffMark;
  compareAction?: string;
}

type StepAlignment =
  | { kind: "match"; brick: number; oracle: number }
  | { kind: "oracle-only"; oracle: number }
  | { kind: "brick-only"; brick: number };

function twoPassStepDiff(
  brick: LineStep[],
  oracle: LineStep[],
): { brick: StepDiffInfo[]; oracle: StepDiffInfo[] } {
  const brickInfo: StepDiffInfo[] = brick.map(() => ({ mark: "same" }));
  const oracleInfo: StepDiffInfo[] = oracle.map(() => ({ mark: "same" }));
  const m = brick.length;
  const n = oracle.length;

  if (m === 0 && n === 0) {
    return { brick: brickInfo, oracle: oracleInfo };
  }

  const dp = Array.from({ length: m + 1 }, () => Array<number>(n + 1).fill(0));

  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      if (brick[i - 1].action === oracle[j - 1].action) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const alignment: StepAlignment[] = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (
      i > 0 &&
      j > 0 &&
      brick[i - 1].action === oracle[j - 1].action
    ) {
      alignment.push({ kind: "match", brick: i - 1, oracle: j - 1 });
      i -= 1;
      j -= 1;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      alignment.push({ kind: "oracle-only", oracle: j - 1 });
      j -= 1;
    } else {
      alignment.push({ kind: "brick-only", brick: i - 1 });
      i -= 1;
    }
  }

  alignment.reverse();

  for (let index = 0; index < alignment.length; index += 1) {
    const entry = alignment[index];

    if (entry.kind === "match") {
      continue;
    }

    if (entry.kind === "oracle-only") {
      const paired = alignment[index + 1];
      if (paired?.kind === "brick-only") {
        oracleInfo[entry.oracle] = {
          mark: "added",
          compareAction: brick[paired.brick].action,
        };
        brickInfo[paired.brick] = { mark: "removed" };
        index += 1;
      } else {
        oracleInfo[entry.oracle] = { mark: "added" };
      }
      continue;
    }

    const paired = alignment[index + 1];
    if (paired?.kind === "oracle-only") {
      oracleInfo[paired.oracle] = {
        mark: "added",
        compareAction: brick[entry.brick].action,
      };
      brickInfo[entry.brick] = { mark: "removed" };
      index += 1;
    } else {
      brickInfo[entry.brick] = { mark: "removed" };
    }
  }

  return { brick: brickInfo, oracle: oracleInfo };
}

const SHORT_TO_NAME = Object.fromEntries(
  CARD_LIST.map((card) => [card.short, card.name]),
) as Record<string, string>;

function parseZoneCards(label: string, prefix: "MEM" | "HAND"): string[] {
  const match = label.match(new RegExp(`^${prefix}\\d+\\s*(.*)$`));
  const rest = match?.[1]?.trim() ?? "";
  if (!rest) return [];
  return rest
    .split(", ")
    .filter(Boolean)
    .map((short) => SHORT_TO_NAME[short] ?? short);
}

function CombatTape({
  steps,
  resetKey,
  stepDiff,
  diffPerspective,
}: {
  steps: LineStep[];
  resetKey: unknown;
  stepDiff?: StepDiffInfo[];
  diffPerspective?: "oracle" | "brick";
}) {
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    setExpanded(null);
  }, [resetKey]);

  return (
    <ol>
      {steps.map((step, index) => {
        const open = expanded === index;
        const memoryCards = parseZoneCards(step.memory, "MEM");
        const handCards = parseZoneCards(step.hand, "HAND");
        const damageDelta =
          index > 0 ? step.damage - steps[index - 1].damage : step.damage;
        const diff = stepDiff?.[index];
        const isOracleDiff =
          diffPerspective === "oracle" && diff?.mark === "added";
        const diffClass = isOracleDiff ? "is-diff-added" : undefined;

        return (
          <li
            key={`${step.display}-${index}`}
            className={[open ? "is-expanded" : undefined, diffClass]
              .filter(Boolean)
              .join(" ") || undefined}
          >
            <button
              type="button"
              className="tape-row"
              aria-expanded={open}
              onClick={() =>
                setExpanded((current) => (current === index ? null : index))
              }
            >
              <span>{String(index).padStart(2, "0")}</span>
              <code>{step.display}</code>
            </button>
            {open && (
              <div className="tape-expand">
                {isOracleDiff && diff?.compareAction && (
                  <p className="tape-diff-compare">
                    <span>Fire brick</span>
                    {diff.compareAction}
                  </p>
                )}
                <p className="tape-expand-action">{step.action}</p>
                <dl className="tape-expand-stats">
                  <div>
                    <dt>Turn</dt>
                    <dd>{step.turn}</dd>
                  </div>
                  <div>
                    <dt>Phase</dt>
                    <dd>{PHASE_LABELS[step.phase] ?? step.phase}</dd>
                  </div>
                  <div>
                    <dt>Damage</dt>
                    <dd>
                      {step.damage}
                      {damageDelta > 0 && (
                        <span className="tape-damage-delta">+{damageDelta}</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Allies</dt>
                    <dd>{step.allies}</dd>
                  </div>
                  <div>
                    <dt>Fire GY</dt>
                    <dd>{step.fireGy}</dd>
                  </div>
                </dl>
                <div className="tape-expand-zones">
                  <div>
                    <span>Allies · {step.allyNames?.length ?? 0}</span>
                    {(step.allyNames?.length ?? 0) > 0 && (
                      <ul>
                        {step.allyNames.map((card, cardIndex) => (
                          <li key={`ally-${card}-${cardIndex}`}>{card}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div>
                    <span>Memory · {memoryCards.length}</span>
                    {memoryCards.length > 0 && (
                      <ul>
                        {memoryCards.map((card, cardIndex) => (
                          <li key={`mem-${card}-${cardIndex}`}>{card}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div>
                    <span>Hand · {handCards.length}</span>
                    {handCards.length > 0 && (
                      <ul>
                        {handCards.map((card, cardIndex) => (
                          <li key={`hand-${card}-${cardIndex}`}>{card}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
