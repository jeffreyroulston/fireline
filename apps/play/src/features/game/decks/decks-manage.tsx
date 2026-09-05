"use client";

import {
  MIN_VALID_DECK_SIZE,
  maxCopiesForCard,
  type CardId,
  type MaterialId,
} from "@ga-fire/game";

import { cn } from "../ui/cn";
import { MainDeckCardGrid, MaterialDeckCardGrid } from "./card-grids";
import { DeckCardCatalog, MaterialCardCatalog } from "./deck-card-catalog";
import {
  addCardToCounts,
  commitCountsToText,
  removeCardFromCounts,
  type DeckBuilderState,
} from "./use-deck-builder-state";

const labelClass =
  "text-[11px] font-semibold tracking-[0.12em] text-muted uppercase";

const inputClass =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus-visible:border-accent";

const buttonClass =
  "rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground transition hover:border-foreground/30 disabled:cursor-not-allowed disabled:opacity-45";

const textButtonClass =
  "rounded-md border border-transparent bg-transparent px-2.5 py-2 text-sm font-medium text-muted transition hover:text-foreground disabled:cursor-not-allowed disabled:opacity-45";

const dangerButtonClass = cn(textButtonClass, "text-primary-dark hover:text-primary");

const toolbarClass =
  "mt-[18px] flex items-end gap-3 max-[620px]:flex-col max-[620px]:items-stretch";

const toolbarActionsClass =
  "flex flex-wrap items-center gap-x-2.5 gap-y-1 max-[620px]:w-full";

const issuesListClass =
  "m-0 list-none p-0 [&_li]:border-t [&_li]:border-primary-dark/20 [&_li]:py-1.5 [&_li:first-child]:border-t-0 [&_li:first-child]:pt-0 [&_li:last-child]:pb-0";

export function DecksManage({ state }: { state: DeckBuilderState }) {
  const {
    decks,
    materialDecks,
    loading,
    activeDeck,
    activeMaterialDeck,
    deckText,
    materialText,
    deckCards,
    materialCards,
    deckCounts,
    materialCounts,
    recognizedDeckCount,
    unrecognizedLines,
    materialIssues,
    isRenamingDeck,
    renameDraft,
    setRenameDraft,
    isRenamingMaterial,
    materialRenameDraft,
    setMaterialRenameDraft,
    switchDeck,
    createDeck,
    deleteDeck,
    startRenameDeck,
    commitRenameDeck,
    cancelRenameDeck,
    updateDeckText,
    assignMaterialDeck,
    createMaterialDeck,
    deleteMaterialDeck,
    startRenameMaterial,
    commitRenameMaterial,
    cancelRenameMaterial,
    updateMaterialText,
  } = state;

  const underSize = recognizedDeckCount < MIN_VALID_DECK_SIZE;
  const issues: string[] = [];
  if (underSize) {
    issues.push(
      `Deck needs at least ${MIN_VALID_DECK_SIZE} recognized cards (${recognizedDeckCount} so far).`,
    );
  }
  for (const line of unrecognizedLines) {
    issues.push(`Unrecognized card: ${line}`);
  }

  const materialEditable = Boolean(
    activeMaterialDeck && !activeMaterialDeck.isSystem,
  );

  function addMainCard(id: CardId) {
    const next = addCardToCounts(deckCounts, id, maxCopiesForCard(id));
    if (!next) return;
    updateDeckText(commitCountsToText(next, unrecognizedLines));
  }

  function removeMainCard(id: CardId) {
    updateDeckText(
      commitCountsToText(removeCardFromCounts(deckCounts, id), unrecognizedLines),
    );
  }

  function addMaterialCard(id: MaterialId) {
    if (!materialEditable) return;
    if ((materialCounts[id] ?? 0) >= 1) return;
    const next = { ...materialCounts, [id]: 1 };
    updateMaterialText(commitCountsToText(next, []));
  }

  function removeMaterialCard(id: MaterialId) {
    if (!materialEditable) return;
    updateMaterialText(commitCountsToText(removeCardFromCounts(materialCounts, id), []));
  }

  return (
    <div className="flex flex-col gap-9">
      <div className="min-w-0">
        <h2 className="m-0 font-mono text-[11px] font-semibold tracking-[0.12em] text-foreground uppercase">
          DECKS
        </h2>
        <div className={toolbarClass}>
          <label className={cn("min-w-[220px] flex-1", labelClass)}>
            Saved deck
            <select
              className={cn(inputClass, "mt-1.5 normal-case tracking-normal")}
              value={activeDeck?.id ?? ""}
              disabled={loading || decks.length === 0}
              onChange={(event) => switchDeck(event.target.value)}
            >
              {decks.length === 0 ? (
                <option value="">
                  {loading ? "Loading decks…" : "No saved decks"}
                </option>
              ) : (
                decks.map((deck) => (
                  <option key={deck.id} value={deck.id}>
                    {deck.name}
                  </option>
                ))
              )}
            </select>
          </label>
          <div className={toolbarActionsClass}>
            <button
              className={buttonClass}
              type="button"
              onClick={() => void createDeck()}
            >
              New deck
            </button>
            <button
              className={textButtonClass}
              type="button"
              onClick={startRenameDeck}
              disabled={!activeDeck}
            >
              Rename
            </button>
            <button
              className={dangerButtonClass}
              type="button"
              onClick={() => void deleteDeck()}
              disabled={!activeDeck}
            >
              Delete
            </button>
          </div>
        </div>

        {isRenamingDeck && activeDeck ? (
          <form
            className="mt-3.5 flex items-end gap-3 max-[620px]:flex-col max-[620px]:items-stretch"
            onSubmit={(event) => {
              event.preventDefault();
              void commitRenameDeck();
            }}
          >
            <label className={cn("flex-1", labelClass)}>
              Deck name
              <input
                className={cn(inputClass, "mt-1.5 normal-case tracking-normal")}
                autoFocus
                value={renameDraft}
                onChange={(event) => setRenameDraft(event.target.value)}
              />
            </label>
            <button className={buttonClass} type="submit">
              Save name
            </button>
            <button
              className={textButtonClass}
              type="button"
              onClick={cancelRenameDeck}
            >
              Cancel
            </button>
          </form>
        ) : null}

        {issues.length > 0 ? (
          <div
            className="mt-[18px] rounded-xl border border-primary-dark/45 bg-primary/10 px-4 py-3.5 text-[13px] leading-[1.45] text-primary-dark"
            role="alert"
          >
            <h3 className="mb-2.5 font-mono text-[11px] font-semibold tracking-[0.12em] uppercase">
              ISSUES
            </h3>
            <ul className={issuesListClass}>
              {issues.map((issue, index) => (
                <li key={`${issue}-${index}`}>{issue}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <MainDeckCardGrid
          cards={deckCards}
          editable={Boolean(activeDeck)}
          onAdd={addMainCard}
          onRemove={removeMainCard}
        />
        {activeDeck ? (
          <DeckCardCatalog
            counts={deckCounts}
            onAdd={addMainCard}
            deckText={deckText}
            onDeckTextChange={updateDeckText}
          />
        ) : null}

        <div className="mt-[18px]">
          <h2 className="m-0 font-mono text-[11px] font-semibold tracking-[0.12em] text-foreground uppercase">
            MATERIAL DECKS
            <span className="ml-2 font-normal normal-case tracking-normal text-muted">
              {materialCards.length} active
            </span>
          </h2>
          <div className={toolbarClass}>
            <label className={cn("min-w-[220px] flex-1", labelClass)}>
              Material deck for this list
              <select
                className={cn(inputClass, "mt-1.5 normal-case tracking-normal")}
                value={activeMaterialDeck?.id ?? ""}
                disabled={!activeDeck || materialDecks.length === 0}
                onChange={(event) => void assignMaterialDeck(event.target.value)}
              >
                {materialDecks.map((deck) => (
                  <option key={deck.id} value={deck.id}>
                    {deck.name}
                    {deck.isSystem ? " · system" : ""}
                  </option>
                ))}
              </select>
            </label>
            <div className={toolbarActionsClass}>
              <button
                className={buttonClass}
                type="button"
                onClick={() => void createMaterialDeck()}
              >
                New material deck
              </button>
              <button
                className={textButtonClass}
                type="button"
                disabled={!materialEditable}
                onClick={startRenameMaterial}
              >
                Rename
              </button>
              <button
                className={dangerButtonClass}
                type="button"
                disabled={!materialEditable}
                onClick={() => void deleteMaterialDeck()}
              >
                Delete
              </button>
            </div>
          </div>

          {isRenamingMaterial && activeMaterialDeck ? (
            <form
              className="mt-3.5 flex items-end gap-3 max-[620px]:flex-col max-[620px]:items-stretch"
              onSubmit={(event) => {
                event.preventDefault();
                void commitRenameMaterial();
              }}
            >
              <label className={cn("flex-1", labelClass)}>
                Material deck name
                <input
                  className={cn(inputClass, "mt-1.5 normal-case tracking-normal")}
                  autoFocus
                  value={materialRenameDraft}
                  onChange={(event) =>
                    setMaterialRenameDraft(event.target.value)
                  }
                />
              </label>
              <button className={buttonClass} type="submit">
                Save name
              </button>
              <button
                className={textButtonClass}
                type="button"
                onClick={cancelRenameMaterial}
              >
                Cancel
              </button>
            </form>
          ) : null}

          {activeMaterialDeck?.isSystem ? (
            <p className="mt-3 text-sm text-muted">
              System preset — assign freely; create a new material deck to edit
              cards.
            </p>
          ) : null}

          {materialIssues.length > 0 && materialEditable ? (
            <div
              className="mt-[18px] rounded-xl border border-primary-dark/45 bg-primary/10 px-4 py-3.5 text-[13px] leading-[1.45] text-primary-dark"
              role="alert"
            >
              <ul className={issuesListClass}>
                {materialIssues.map((issue, index) => (
                  <li key={`${issue}-${index}`}>{issue}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <MaterialDeckCardGrid
            materialCards={materialCards}
            editable={materialEditable}
            onAdd={addMaterialCard}
            onRemove={removeMaterialCard}
          />
          {materialEditable ? (
            <MaterialCardCatalog
              counts={materialCounts}
              onAdd={addMaterialCard}
              materialText={materialText}
              onMaterialTextChange={updateMaterialText}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
