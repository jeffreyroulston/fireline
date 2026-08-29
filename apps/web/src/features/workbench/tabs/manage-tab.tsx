"use client";

import type { CardId } from "@/lib/engine";
import type { SavedDeck } from "@/lib/decks";
import {
  DEFAULT_MATERIAL_DECK_TEXT,
  type SavedMaterialDeck,
} from "@/lib/material-decks";
import { parseMaterialDecklist } from "@/lib/engine";
import { DecksManage } from "../panels/decks";

type ManageTabProps = Readonly<{
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
  isRenamingMaterialDeck: boolean;
  materialRenameDraft: string;
  decksLoading: boolean;
  onSwitchDeck: (deckId: string) => void;
  onCreateDeck: () => void;
  onDuplicateDeck: () => void;
  onStartRename: () => void;
  onDeleteDeck: () => void;
  onRenameDraftChange: (draft: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onDeckTextChange: (text: string) => void;
  onAssignMaterialDeck: (materialDeckId: string) => void;
  onCreateMaterialDeck: (name: string, text: string) => Promise<SavedMaterialDeck | null>;
  onStartMaterialRename: () => void;
  onDeleteMaterialDeck: (deck: SavedMaterialDeck) => void;
  onMaterialRenameDraftChange: (draft: string) => void;
  onCommitMaterialRename: () => void;
  onCancelMaterialRename: () => void;
}>;

export function ManageTab({
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
  isRenamingMaterialDeck,
  materialRenameDraft,
  decksLoading,
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
}: ManageTabProps) {
  return (
    <DecksManage
      decks={decks}
      activeDeck={activeDeck}
      deckText={deckText}
      deckCards={deckCards}
      recognizedDeckCount={recognizedDeckCount}
      unrecognizedLines={unrecognizedLines}
      isRenamingDeck={isRenamingDeck}
      renameDraft={renameDraft}
      materialDecks={materialDecks}
      activeMaterialDeck={activeMaterialDeck}
      materialCards={parseMaterialDecklist(
        activeMaterialDeck?.text ?? DEFAULT_MATERIAL_DECK_TEXT,
      )}
      isRenamingMaterialDeck={isRenamingMaterialDeck}
      materialRenameDraft={materialRenameDraft}
      onSwitchDeck={onSwitchDeck}
      onCreateDeck={onCreateDeck}
      onDuplicateDeck={onDuplicateDeck}
      onStartRename={onStartRename}
      onDeleteDeck={onDeleteDeck}
      onRenameDraftChange={onRenameDraftChange}
      onCommitRename={onCommitRename}
      onCancelRename={onCancelRename}
      onDeckTextChange={onDeckTextChange}
      onAssignMaterialDeck={onAssignMaterialDeck}
      onCreateMaterialDeck={onCreateMaterialDeck}
      onStartMaterialRename={onStartMaterialRename}
      onDeleteMaterialDeck={onDeleteMaterialDeck}
      onMaterialRenameDraftChange={onMaterialRenameDraftChange}
      onCommitMaterialRename={onCommitMaterialRename}
      onCancelMaterialRename={onCancelMaterialRename}
      decksLoading={decksLoading}
    />
  );
}
