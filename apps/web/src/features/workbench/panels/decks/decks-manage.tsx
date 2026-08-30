"use client";

import type { SavedDeck } from "@/lib/decks";
import { isDeckCardlistLocked } from "@/lib/decks";
import {
  MIN_VALID_DECK_SIZE,
  analyzeMaterialDecklist,
  formatDecklist,
  listToCounts,
  maxCopiesForCard,
  type DeckCounts,
} from "@/lib/engine";
import type { SavedMaterialDeck } from "@/lib/material-decks";
import {
  DEFAULT_MATERIAL_DECK_TEXT,
  isMaterialDeckDeletable,
  nextMaterialDeckName,
} from "@/lib/material-decks";
import type { CardId, MaterialId } from "@/lib/engine/types";
import { useState } from "react";
import { cn } from "@/lib/utils/cn";
import { buttonVariants } from "@/lib/utils/variants";
import { DeckPicker, MaterialDeckPicker, SectionHeading } from "../../ui";
import { MainDeckCardGrid, MaterialDeckCardGrid } from "./card-grids";
import { DeckCardCatalog } from "./deck-card-catalog";
import { DeckTextListDetails } from "./deck-text-list-details";

const toolbarClass =
  "mt-[18px] flex items-end gap-3 max-[620px]:flex-col max-[620px]:items-stretch";

const toolbarActionsClass =
  "flex flex-wrap items-center gap-x-2.5 gap-y-1 max-[620px]:w-full";

const secondaryButtonClass = cn(
  buttonVariants({ intent: "secondary" }),
  "whitespace-nowrap max-[620px]:w-full",
);

const textButtonClass = buttonVariants({ intent: "text" });

const deckTextareaClass =
  "min-h-[310px] resize-y p-4 font-mono text-xs leading-[1.8] normal-case read-only:cursor-default read-only:opacity-85";

const deckIssuesListClass =
  "m-0 list-none p-0 [&_li]:border-t [&_li]:border-primary-dark/20 [&_li]:py-1.5 [&_li]:text-[13px] [&_li]:leading-[1.45] [&_li]:text-primary-dark [&_li:first-child]:border-t-0 [&_li:first-child]:pt-0 [&_li:last-child]:pb-0";

function commitDeckCounts(
  counts: DeckCounts,
  unrecognizedLines: string[],
  onDeckTextChange: (text: string) => void,
) {
  const formatted = formatDecklist(counts);
  if (unrecognizedLines.length === 0) {
    onDeckTextChange(formatted);
    return;
  }
  const trailer = unrecognizedLines.join("\n");
  onDeckTextChange(
    formatted ? `${formatted.trimEnd()}\n\n${trailer}\n` : `${trailer}\n`,
  );
}

export function DecksManage({
  decks,
  activeDeck,
  deckText,
  deckCards,
  recognizedDeckCount,
  unrecognizedLines,
  isRenamingDeck,
  renameDraft,
  materialDecks,
  activeMaterialDeck,
  materialCards,
  isRenamingMaterialDeck,
  materialRenameDraft,
  onSwitchDeck,
  onCreateDeck,
  onDuplicateDeck,
  onStartRename,
  onDeleteDeck,
  onRenameDraftChange,
  onCommitRename,
  onCancelRename,
  onDeckTextChange,
  onAssignMaterialDeck,
  onCreateMaterialDeck,
  onStartMaterialRename,
  onDeleteMaterialDeck,
  onMaterialRenameDraftChange,
  onCommitMaterialRename,
  onCancelMaterialRename,
  decksLoading = false,
}: {
  decks: SavedDeck[];
  activeDeck: SavedDeck | null;
  deckText: string;
  deckCards: CardId[];
  recognizedDeckCount: number;
  unrecognizedLines: string[];
  isRenamingDeck: boolean;
  renameDraft: string;
  materialDecks: SavedMaterialDeck[];
  activeMaterialDeck: SavedMaterialDeck | null;
  materialCards: MaterialId[];
  isRenamingMaterialDeck: boolean;
  materialRenameDraft: string;
  onSwitchDeck: (deckId: string) => void;
  onCreateDeck: () => void;
  onDuplicateDeck: () => void;
  onStartRename: () => void;
  onDeleteDeck: () => void;
  onRenameDraftChange: (value: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onDeckTextChange: (text: string) => void;
  onAssignMaterialDeck: (materialDeckId: string) => void;
  onCreateMaterialDeck: (name: string, text: string) => Promise<SavedMaterialDeck | null>;
  onStartMaterialRename: () => void;
  onDeleteMaterialDeck: (deck: SavedMaterialDeck) => void;
  onMaterialRenameDraftChange: (value: string) => void;
  onCommitMaterialRename: () => void;
  onCancelMaterialRename: () => void;
  decksLoading?: boolean;
}) {
  const locked = activeDeck ? isDeckCardlistLocked(activeDeck) : false;
  const [materialDraftMode, setMaterialDraftMode] = useState<
    null | "create" | "duplicate"
  >(null);
  const [materialDraftName, setMaterialDraftName] = useState("");
  const [materialDraftText, setMaterialDraftText] = useState(
    DEFAULT_MATERIAL_DECK_TEXT,
  );

  const materialDraftAnalysis = analyzeMaterialDecklist(materialDraftText);
  const underSize = recognizedDeckCount < MIN_VALID_DECK_SIZE;
  const deckCounts = listToCounts(deckCards);
  const issues: string[] = [];
  if (underSize) {
    issues.push(
      `Deck needs at least ${MIN_VALID_DECK_SIZE} recognized cards (${recognizedDeckCount} so far).`,
    );
  }
  for (const line of unrecognizedLines) {
    issues.push(`Unrecognized card: ${line}`);
  }

  function addCard(id: CardId) {
    const next = { ...deckCounts };
    const qty = next[id] ?? 0;
    if (qty >= maxCopiesForCard(id)) return;
    next[id] = qty + 1;
    commitDeckCounts(next, unrecognizedLines, onDeckTextChange);
  }

  function removeCard(id: CardId) {
    const next = { ...deckCounts };
    const qty = next[id] ?? 0;
    if (qty <= 0) return;
    if (qty === 1) {
      delete next[id];
    } else {
      next[id] = qty - 1;
    }
    commitDeckCounts(next, unrecognizedLines, onDeckTextChange);
  }

  async function saveMaterialDraft() {
    const saved = await onCreateMaterialDeck(
      materialDraftName.trim() || nextMaterialDeckName(materialDecks),
      materialDraftText,
    );
    if (saved) {
      setMaterialDraftMode(null);
    }
  }

  return (
    <div className="flex flex-col gap-9">
      <div className="min-w-0">
        <SectionHeading title="DECKS" />
        <div className={toolbarClass}>
          <DeckPicker
            label="Saved deck"
            decks={decks}
            value={activeDeck?.id ?? ""}
            onChange={onSwitchDeck}
            loading={decksLoading}
            formatOption={(deck) =>
              `${deck.name}${isDeckCardlistLocked(deck) ? " · locked" : ""}`
            }
          />
          <div className={toolbarActionsClass}>
            <button className={secondaryButtonClass} type="button" onClick={onCreateDeck}>
              New deck
            </button>
            <button
              className={textButtonClass}
              type="button"
              onClick={onDuplicateDeck}
              disabled={!activeDeck}
            >
              Duplicate
            </button>
            <button
              className={textButtonClass}
              type="button"
              onClick={onStartRename}
              disabled={!activeDeck}
            >
              Rename
            </button>
            <button
              className={buttonVariants({ intent: "text", danger: true })}
              type="button"
              onClick={onDeleteDeck}
              disabled={!activeDeck}
            >
              Delete
            </button>
          </div>
        </div>
        {isRenamingDeck && activeDeck && (
          <form
            className="mt-3.5 flex items-end gap-3 max-[620px]:flex-col max-[620px]:items-stretch"
            onSubmit={(event) => {
              event.preventDefault();
              onCommitRename();
            }}
          >
            <label className="flex-1">
              Deck name
              <input
                autoFocus
                value={renameDraft}
                onChange={(event) => onRenameDraftChange(event.target.value)}
              />
            </label>
            <button className={secondaryButtonClass} type="submit">
              Save name
            </button>
            <button className={textButtonClass} type="button" onClick={onCancelRename}>
              Cancel
            </button>
          </form>
        )}
        {locked && (
          <div
            className="my-3 mb-[18px] border border-primary-dark/45 border-l-4 border-l-primary bg-[color-mix(in_srgb,var(--color-primary)_12%,white)] px-3.5 py-3 text-[13px] leading-[1.45] text-primary-dark"
            role="status"
          >
            <strong className="mb-1 block text-xs tracking-[0.04em] uppercase">
              Cardlist locked
            </strong>
            <p className="m-0 text-foreground">
              This deck has simulations, so its list cannot be edited.
              Duplicate it to make changes.
            </p>
          </div>
        )}
        {issues.length > 0 && (
          <div
            className="mt-[18px] border border-primary-dark/45 bg-[color-mix(in_srgb,var(--color-primary)_12%,white)] px-4 py-3.5"
            role="alert"
          >
            <SectionHeading
              title="ISSUES"
              meta={<strong>{issues.length}</strong>}
              className="mb-2.5 text-primary-dark [&_strong]:text-primary-dark"
            />
            <ul className={deckIssuesListClass}>
              {issues.map((issue, index) => (
                <li key={`${issue}-${index}`}>{issue}</li>
              ))}
            </ul>
          </div>
        )}

        <MainDeckCardGrid
          cards={deckCards}
          editable={!locked}
          onAdd={addCard}
          onRemove={removeCard}
        />
        {locked && <DeckTextListDetails deckText={deckText} readOnly />}
        {!locked && (
          <DeckCardCatalog
            counts={deckCounts}
            onAdd={addCard}
            deckText={deckText}
            onDeckTextChange={onDeckTextChange}
          />
        )}

        {!locked && (
          <div className="mt-[18px]">
            <SectionHeading
              title="MATERIAL DECKS"
              meta={<strong>{`${materialCards.length} active`}</strong>}
            />
            <div className={toolbarClass}>
              <MaterialDeckPicker
                label="Material deck for this list"
                decks={materialDecks}
                value={
                  activeMaterialDeck?.id ?? activeDeck?.materialDeckId ?? ""
                }
                onChange={onAssignMaterialDeck}
                disabled={materialDecks.length === 0}
              />
              <div className={toolbarActionsClass}>
                <button
                  className={secondaryButtonClass}
                  type="button"
                  onClick={() => {
                    setMaterialDraftMode("create");
                    setMaterialDraftName(nextMaterialDeckName(materialDecks));
                    setMaterialDraftText(DEFAULT_MATERIAL_DECK_TEXT);
                  }}
                >
                  New material deck
                </button>
                <button
                  className={textButtonClass}
                  type="button"
                  disabled={!activeMaterialDeck}
                  onClick={() => {
                    if (!activeMaterialDeck) return;
                    setMaterialDraftMode("duplicate");
                    setMaterialDraftName(
                      nextMaterialDeckName(
                        materialDecks,
                        `${activeMaterialDeck.name} copy`,
                      ),
                    );
                    setMaterialDraftText(activeMaterialDeck.text);
                  }}
                >
                  Duplicate
                </button>
                <button
                  className={textButtonClass}
                  type="button"
                  disabled={!activeMaterialDeck}
                  onClick={onStartMaterialRename}
                >
                  Rename
                </button>
                <button
                  className={buttonVariants({ intent: "text", danger: true })}
                  type="button"
                  disabled={
                    !activeMaterialDeck ||
                    !isMaterialDeckDeletable(activeMaterialDeck)
                  }
                  onClick={() => {
                    if (activeMaterialDeck) {
                      onDeleteMaterialDeck(activeMaterialDeck);
                    }
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
            {isRenamingMaterialDeck && activeMaterialDeck && (
              <form
                className="mt-3.5 flex items-end gap-3 max-[620px]:flex-col max-[620px]:items-stretch"
                onSubmit={(event) => {
                  event.preventDefault();
                  onCommitMaterialRename();
                }}
              >
                <label className="flex-1">
                  Material deck name
                  <input
                    autoFocus
                    value={materialRenameDraft}
                    onChange={(event) =>
                      onMaterialRenameDraftChange(event.target.value)
                    }
                  />
                </label>
                <button className={secondaryButtonClass} type="submit">
                  Save name
                </button>
                <button
                  className={textButtonClass}
                  type="button"
                  onClick={onCancelMaterialRename}
                >
                  Cancel
                </button>
              </form>
            )}
            {materialDraftMode && (
              <div className="mt-[18px] grid gap-[7px]">
                <label>
                  Material deck name
                  <input
                    value={materialDraftName}
                    onChange={(event) => setMaterialDraftName(event.target.value)}
                  />
                </label>
                <label>
                  One material card per line, with quantity
                  <textarea
                    className={deckTextareaClass}
                    value={materialDraftText}
                    onChange={(event) => setMaterialDraftText(event.target.value)}
                    spellCheck={false}
                  />
                </label>
                {materialDraftAnalysis.issues.length > 0 && (
                  <div
                    className="border border-primary-dark/45 bg-[color-mix(in_srgb,var(--color-primary)_12%,white)] px-4 py-3.5"
                    role="alert"
                  >
                    <ul className={deckIssuesListClass}>
                      {materialDraftAnalysis.issues.map((issue, index) => (
                        <li key={`${issue}-${index}`}>{issue}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className={toolbarActionsClass}>
                  <button
                    className={secondaryButtonClass}
                    type="button"
                    disabled={materialDraftAnalysis.recognizedCount === 0}
                    onClick={() => void saveMaterialDraft()}
                  >
                    Save material deck
                  </button>
                  <button
                    className={textButtonClass}
                    type="button"
                    onClick={() => setMaterialDraftMode(null)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        <MaterialDeckCardGrid materialCards={materialCards} />
      </div>
    </div>
  );
}
