"use client";

import { cardImageUrl } from "@/lib/card-images";
import type { SavedDeck } from "@/lib/decks";
import { isDeckCardlistLocked } from "@/lib/decks";
import {
  CARDS,
  MATERIAL_NAMES,
  MIN_VALID_DECK_SIZE,
  analyzeMaterialDecklist,
  isMaterialId,
} from "@/lib/engine";
import type { SavedMaterialDeck } from "@/lib/material-decks";
import {
  DEFAULT_MATERIAL_DECK_TEXT,
  isMaterialDeckDeletable,
  nextMaterialDeckName,
} from "@/lib/material-decks";
import type { CardDef, CardId, MaterialId } from "@/lib/engine/types";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { DeckPicker, SectionHeading } from "../ui";

const CARD_PREVIEW_DELAY_MS = 450;
const CARD_PREVIEW_WIDTH = 312;
const CARD_PREVIEW_MARGIN = 12;

function tallyCards(cards: CardId[]): { id: CardId; qty: number }[] {
  const counts = new Map<CardId, number>();
  for (const id of cards) {
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return [...counts.entries()].map(([id, qty]) => ({ id, qty }));
}

function cardTraitLines(card: CardDef): string[] {
  const traits: string[] = [];
  if (card.unique) traits.push("Unique");
  if (card.stealth) traits.push("Stealth");
  if (card.floatingMemory) traits.push("Floating Memory");
  if (card.assassinPowerBonus) {
    traits.push(`Assassin +${card.assassinPowerBonus} power`);
  }
  if (card.assassinStealth) traits.push("Assassin Stealth");
  if (card.automaton) traits.push("Automaton");
  if (card.fast) traits.push("Fast");
  if (card.kindle) traits.push(`Kindle ${card.kindle}`);
  if (card.prepare) traits.push(`Prepare ${card.prepare}`);
  return traits;
}

function clampPreviewPosition(
  anchor: DOMRect,
  previewWidth: number,
  previewHeight: number,
): { top: number; left: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const margin = CARD_PREVIEW_MARGIN;
  const maxLeft = Math.max(margin, vw - previewWidth - margin);
  const maxTop = Math.max(margin, vh - previewHeight - margin);

  const preferRight = vw - anchor.right >= previewWidth + margin * 2;
  let left = preferRight
    ? anchor.right + margin
    : anchor.left - previewWidth - margin;
  left = Math.min(Math.max(margin, left), maxLeft);

  let top = anchor.top;
  top = Math.min(Math.max(margin, top), maxTop);

  return { top, left };
}

function DeckCardPreview({
  card,
  qty,
  src,
  anchor,
  onClose,
}: {
  card: CardDef;
  qty: number;
  src: string | null;
  anchor: DOMRect;
  onClose: () => void;
}) {
  const previewRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({
    position: "fixed",
    top: 0,
    left: 0,
    width: CARD_PREVIEW_WIDTH,
    maxHeight: `calc(100vh - ${CARD_PREVIEW_MARGIN * 2}px)`,
    visibility: "hidden",
  });

  function placePreview() {
    const node = previewRef.current;
    if (!node) return;
    const { width, height } = node.getBoundingClientRect();
    const { top, left } = clampPreviewPosition(
      anchor,
      width || CARD_PREVIEW_WIDTH,
      height || 1,
    );
    setStyle({
      position: "fixed",
      top,
      left,
      width: CARD_PREVIEW_WIDTH,
      maxHeight: `calc(100vh - ${CARD_PREVIEW_MARGIN * 2}px)`,
      visibility: "visible",
    });
  }

  useLayoutEffect(() => {
    placePreview();
  }, [anchor]);

  useEffect(() => {
    function reposition() {
      placePreview();
    }
    function hide() {
      onClose();
    }
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", hide, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", hide, true);
    };
  }, [anchor, onClose]);

  const traits = cardTraitLines(card);
  const combat =
    card.power != null || card.life != null
      ? `${card.power ?? "—"} power / ${card.life ?? "—"} life`
      : null;

  return (
    <div
      ref={previewRef}
      className="deck-card-preview"
      role="tooltip"
      style={style}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote GATCG art; no next/image domain config
        <img src={src} alt="" onLoad={placePreview} />
      ) : (
        <div
          className={`card-tile deck-card-preview-fallback${card.element === "fire" ? " is-fire" : ""}`}
        >
          <span>{card.element}</span>
          <b>{card.name}</b>
          <small>
            {card.cost} · {card.kind}
          </small>
        </div>
      )}
      <div className="deck-card-preview-body">
        <p className="deck-card-preview-qty">{qty}×</p>
        <h3>{card.name}</h3>
        <p>
          {card.kind} · {card.element} · cost {card.cost}
        </p>
        {combat && <p>{combat}</p>}
        {traits.length > 0 && (
          <ul>
            {traits.map((trait) => (
              <li key={trait}>{trait}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function resolveDeckCard(id: CardId | MaterialId): CardDef | null {
  const fromCatalog = CARDS[id];
  if (fromCatalog) return fromCatalog;
  if (!isMaterialId(id)) return null;
  return {
    id: id as CardId,
    name: MATERIAL_NAMES[id],
    short: MATERIAL_NAMES[id].slice(0, 5),
    kind: "material",
    cost: 0,
    element: "norm",
  };
}

function DeckCardFace({ id, qty }: { id: CardId | MaterialId; qty: number }) {
  const card = resolveDeckCard(id);
  const src = cardImageUrl(id);
  const faceRef = useRef<HTMLElement>(null);
  const timerRef = useRef<number | null>(null);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);

  function clearTimer() {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  const hidePreview = useCallback(() => {
    clearTimer();
    setAnchor(null);
  }, []);

  function showPreviewSoon() {
    clearTimer();
    timerRef.current = window.setTimeout(() => {
      const el = faceRef.current;
      if (!el) return;
      setAnchor(el.getBoundingClientRect());
    }, CARD_PREVIEW_DELAY_MS);
  }

  useEffect(() => () => clearTimer(), []);

  if (!card) return null;

  return (
    <figure
      ref={faceRef}
      className="deck-card-face"
      onMouseEnter={showPreviewSoon}
      onMouseLeave={hidePreview}
      onFocus={showPreviewSoon}
      onBlur={hidePreview}
      tabIndex={0}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote GATCG art; no next/image domain config
        <img src={src} alt={card.name} loading="lazy" />
      ) : (
        <div
          className={`card-tile deck-card-fallback${card.element === "fire" ? " is-fire" : ""}`}
        >
          <span>{card.element}</span>
          <b>{card.name}</b>
          <small>
            {card.cost} · {card.kind}
          </small>
        </div>
      )}
      <figcaption>
        <span className="deck-card-qty" aria-label={`Quantity ${qty}`}>
          {qty}
        </span>
        <span className="deck-card-name">{card.name}</span>
      </figcaption>
      {anchor &&
        createPortal(
          <DeckCardPreview
            card={card}
            qty={qty}
            src={src}
            anchor={anchor}
            onClose={hidePreview}
          />,
          document.body,
        )}
    </figure>
  );
}

function MainDeckCardGrid({ cards }: { cards: CardId[] }) {
  const entries = tallyCards(cards);
  if (entries.length === 0) return null;

  return (
    <div className="deck-card-panel">
      <SectionHeading
        title="CARD LIST"
        meta={<strong>{entries.length} unique</strong>}
      />
      <div className="deck-card-grid" aria-label="Deck card images">
        {entries.map(({ id, qty }) => (
          <DeckCardFace key={id} id={id} qty={qty} />
        ))}
      </div>
    </div>
  );
}

function MaterialDeckCardGrid({ materialCards }: { materialCards: MaterialId[] }) {
  return (
    <div className="deck-card-panel">
      <SectionHeading
        title="MATERIAL DECK"
        meta={<strong>{materialCards.length} cards</strong>}
      />
      <div className="deck-card-grid" aria-label="Material deck card images">
        {materialCards.map((id) => (
          <DeckCardFace key={id} id={id} qty={1} />
        ))}
      </div>
    </div>
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
  const issues: string[] = [];
  if (underSize) {
    issues.push(
      `Deck needs at least ${MIN_VALID_DECK_SIZE} recognized cards (${recognizedDeckCount} so far).`,
    );
  }
  for (const line of unrecognizedLines) {
    issues.push(`Unrecognized card: ${line}`);
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
    <div className="mode-layout line-mode">
      <div className="controls">
        <SectionHeading
          title="DECKS"
          meta={
            <strong>
              {recognizedDeckCount} recognized
              {underSize ? ` · need ${MIN_VALID_DECK_SIZE}+` : ""}
            </strong>
          }
        />
        <div className="deck-toolbar">
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
          <div className="deck-toolbar-actions">
            <button
              className="secondary-action"
              type="button"
              onClick={onCreateDeck}
            >
              New deck
            </button>
            <button
              className="text-action"
              type="button"
              onClick={onDuplicateDeck}
              disabled={!activeDeck}
            >
              Duplicate
            </button>
            <button
              className="text-action"
              type="button"
              onClick={onStartRename}
              disabled={!activeDeck}
            >
              Rename
            </button>
            <button
              className="text-action is-danger"
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
            className="deck-rename-row"
            onSubmit={(event) => {
              event.preventDefault();
              onCommitRename();
            }}
          >
            <label>
              Deck name
              <input
                autoFocus
                value={renameDraft}
                onChange={(event) => onRenameDraftChange(event.target.value)}
              />
            </label>
            <button className="secondary-action" type="submit">
              Save name
            </button>
            <button
              className="text-action"
              type="button"
              onClick={onCancelRename}
            >
              Cancel
            </button>
          </form>
        )}
        {locked && (
          <div className="deck-lock-note" role="status">
            <strong>Cardlist locked</strong>
            <p>
              This deck has simulations, so its list cannot be edited.
              Duplicate it to make changes.
            </p>
          </div>
        )}
        {!locked && (
          <label className="deck-input">
            One card per line, with quantity
            <textarea
              value={deckText}
              onChange={(event) => onDeckTextChange(event.target.value)}
              spellCheck={false}
            />
          </label>
        )}
        {issues.length > 0 && (
          <div className="deck-issues" role="alert">
            <SectionHeading
              title="ISSUES"
              meta={<strong>{issues.length}</strong>}
            />
            <ul>
              {issues.map((issue, index) => (
                <li key={`${issue}-${index}`}>{issue}</li>
              ))}
            </ul>
          </div>
        )}

        <MainDeckCardGrid cards={deckCards} />

        {!locked && (
          <div className="deck-material-section">
            <SectionHeading
              title="MATERIAL DECKS"
              meta={<strong>{`${materialCards.length} active`}</strong>}
            />
            <div className="deck-toolbar">
              <label className="deck-picker">
                Material deck for this list
                <select
                  value={
                    activeMaterialDeck?.id ?? activeDeck?.materialDeckId ?? ""
                  }
                  onChange={(event) => onAssignMaterialDeck(event.target.value)}
                  disabled={materialDecks.length === 0}
                >
                  {materialDecks.map((deck) => (
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
                  onClick={() => {
                    setMaterialDraftMode("create");
                    setMaterialDraftName(nextMaterialDeckName(materialDecks));
                    setMaterialDraftText(DEFAULT_MATERIAL_DECK_TEXT);
                  }}
                >
                  New material deck
                </button>
                <button
                  className="text-action"
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
                  className="text-action"
                  type="button"
                  disabled={!activeMaterialDeck}
                  onClick={onStartMaterialRename}
                >
                  Rename
                </button>
                <button
                  className="text-action is-danger"
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
                className="deck-rename-row"
                onSubmit={(event) => {
                  event.preventDefault();
                  onCommitMaterialRename();
                }}
              >
                <label>
                  Material deck name
                  <input
                    autoFocus
                    value={materialRenameDraft}
                    onChange={(event) =>
                      onMaterialRenameDraftChange(event.target.value)
                    }
                  />
                </label>
                <button className="secondary-action" type="submit">
                  Save name
                </button>
                <button
                  className="text-action"
                  type="button"
                  onClick={onCancelMaterialRename}
                >
                  Cancel
                </button>
              </form>
            )}
            {materialDraftMode && (
              <div className="deck-input">
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
                    value={materialDraftText}
                    onChange={(event) => setMaterialDraftText(event.target.value)}
                    spellCheck={false}
                  />
                </label>
                {materialDraftAnalysis.issues.length > 0 && (
                  <div className="deck-issues" role="alert">
                    <ul>
                      {materialDraftAnalysis.issues.map((issue, index) => (
                        <li key={`${issue}-${index}`}>{issue}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="deck-toolbar-actions">
                  <button
                    className="secondary-action"
                    type="button"
                    disabled={materialDraftAnalysis.recognizedCount === 0}
                    onClick={() => void saveMaterialDraft()}
                  >
                    Save material deck
                  </button>
                  <button
                    className="text-action"
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
