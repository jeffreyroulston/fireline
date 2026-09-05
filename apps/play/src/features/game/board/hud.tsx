"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import {
  type ActionTargetIndex,
  type IndexedActionOption,
  ENEMY_CHAMPION_LIFE,
  MATERIAL_TARGET,
  RING_TARGET,
  materialCountFromMask,
  materialIdForAction,
  materialsFromMask,
  optionsForTarget,
  PHASE_TARGET,
  type MaterialId,
} from "@ga-fire/game";
import type { PlaytestStateView } from "@ga-fire/contracts";

import { CardTile } from "../ui";
import { cn } from "../ui/cn";
import { PHASE_LABEL, phaseActionLabel } from "./utils";
import { VariantMenu } from "./variant-menu";

export type HudProps = {
  board: PlaytestStateView;
  index: ActionTargetIndex;
  onSelect: (option: IndexedActionOption) => void;
  className?: string;
  /** Duel: own champion life. When set, replaces Spirit damage readout. */
  championLife?: number;
  opponentLife?: number;
};

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-[9px] uppercase tracking-wide text-white/50">
        {label}
      </span>
      <span
        className={cn(
          "font-display text-xl leading-none tabular-nums text-white",
          accent && "text-primary",
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function Hud({
  board,
  index,
  onSelect,
  className,
  championLife,
  opponentLife,
}: HudProps) {
  const phaseRef = useRef<HTMLButtonElement>(null);
  const [menuRect, setMenuRect] = useState<DOMRect | null>(null);
  const phaseOptions = optionsForTarget(index, PHASE_TARGET);
  const phasePlayable = phaseOptions.length > 0;
  const duel = championLife != null;

  const primary = phaseOptions[0];
  const buttonLabel = primary
    ? phaseActionLabel(primary.option.action.op, board.phase, primary.label)
    : null;

  const activatePhase = useCallback(() => {
    if (!phasePlayable) return;
    if (phaseOptions.length === 1) {
      onSelect(phaseOptions[0]!);
      return;
    }
    setMenuRect(phaseRef.current?.getBoundingClientRect() ?? null);
  }, [onSelect, phaseOptions, phasePlayable]);

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-4 border-t border-white/15 bg-black/80 px-4 py-3 text-white",
        className,
      )}
    >
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {duel ? (
          <>
            <Stat label="Your life" value={championLife} accent />
            {opponentLife != null ? (
              <Stat label="Opp life" value={opponentLife} accent />
            ) : null}
            <Stat label="Line dmg" value={board.damage} />
          </>
        ) : (
          <Stat
            label="Damage"
            value={`${board.damage} / ${ENEMY_CHAMPION_LIFE}`}
            accent
          />
        )}
        <Stat label="Turn" value={board.turn + 1} />
        <Stat
          label="Phase"
          value={PHASE_LABEL[board.phase] ?? board.phase}
        />
        <Stat label="Fire GY" value={board.fireGy} />
        <Stat
          label="Float GY"
          value={board.floatGy}
          accent={board.floatGy > 0}
        />
        <Stat label="Prep" value={board.prep} />
        <Stat label="Agility" value={board.agility} />
        <Stat
          label="Amplify"
          value={board.amplify ? "On" : "Off"}
          accent={board.amplify}
        />
        <Stat label="Champion Lv" value={board.championLevel} />
        <Stat
          label="Ring"
          value={
            board.ring ? "Equipped" : board.ringBanished ? "Banished" : "—"
          }
        />
      </div>

      {phasePlayable && buttonLabel ? (
        <button
          ref={phaseRef}
          type="button"
          className={cn(
            "shrink-0 rounded-md border border-accent/60 bg-accent/20 px-5 py-3",
            "font-display text-lg leading-none tracking-wide text-accent",
            "transition-colors hover:bg-accent/30 hover:border-accent",
          )}
          onClick={activatePhase}
        >
          {buttonLabel}
          {phaseOptions.length > 1 ? (
            <span className="ml-2 font-mono text-[11px] text-accent/70">
              +{phaseOptions.length - 1}
            </span>
          ) : null}
        </button>
      ) : null}

      {menuRect != null && phaseOptions.length > 1 ? (
        <VariantMenu
          options={phaseOptions.map((entry) => ({
            ...entry,
            label: phaseActionLabel(
              entry.option.action.op,
              board.phase,
              entry.label,
            ),
          }))}
          anchorRect={menuRect}
          onSelect={(entry) => {
            setMenuRect(null);
            onSelect(entry);
          }}
          onClose={() => setMenuRect(null)}
        />
      ) : null}
    </div>
  );
}

export type MaterialZoneProps = {
  board: PlaytestStateView;
  index: ActionTargetIndex;
  onSelect: (option: IndexedActionOption) => void;
  /** Fit the 72px champion/opponent strip. */
  compact?: boolean;
  /** Playmat side slot styling (vertical card well). */
  playmat?: boolean;
  /** Compact slots for dual-sided playmat. */
  size?: "md" | "sm";
};

export function MaterialZone({
  board,
  index,
  onSelect,
  compact = false,
  playmat = false,
}: MaterialZoneProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [variantOptions, setVariantOptions] = useState<
    readonly IndexedActionOption[]
  >([]);
  const [variantLabel, setVariantLabel] = useState<string | null>(null);

  const materialOptions = optionsForTarget(index, MATERIAL_TARGET);
  const ringMaterialize = useMemo(
    () =>
      optionsForTarget(index, RING_TARGET).filter(
        (entry) => materialIdForAction(entry.option.action) != null,
      ),
    [index],
  );

  const optionsByMaterial = useMemo(() => {
    const map = new Map<MaterialId, IndexedActionOption[]>();
    for (const entry of [...materialOptions, ...ringMaterialize]) {
      const id = materialIdForAction(entry.option.action);
      if (!id) continue;
      const list = map.get(id) ?? [];
      list.push(entry);
      map.set(id, list);
    }
    return map;
  }, [materialOptions, ringMaterialize]);

  const playable = optionsByMaterial.size > 0;
  const remaining = materialsFromMask(board.engine.materials);
  const count = materialCountFromMask(board.engine.materials);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const playOption = useCallback(
    (entry: IndexedActionOption) => {
      setOpen(false);
      setVariantOptions([]);
      setVariantLabel(null);
      onSelect(entry);
    },
    [onSelect],
  );

  const activateMaterial = useCallback(
    (id: MaterialId) => {
      const entries = optionsByMaterial.get(id);
      if (!entries || entries.length === 0) return;
      if (entries.length === 1) {
        playOption(entries[0]!);
        return;
      }
      setVariantLabel(id.replaceAll("_", " "));
      setVariantOptions(entries);
    },
    [optionsByMaterial, playOption],
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "flex flex-col items-center justify-center border text-center transition-colors",
          playmat
            ? "h-[157px] w-[112px] rounded-[2px] border-white/55 bg-transparent px-1.5 py-1.5"
            : compact
              ? "h-full min-w-[88px] rounded-md px-2 py-1"
              : "min-h-[88px] min-w-[72px] rounded-md px-2 py-2",
          playmat &&
            (playable
              ? "border-accent/70 bg-accent/15 hover:bg-accent/20"
              : "hover:border-white/80 hover:bg-white/[0.03]"),
          !playmat &&
            (playable
              ? "cursor-pointer border-accent/50 bg-accent/10 hover:bg-accent/15"
              : "cursor-pointer border-border bg-surface-deep/60 hover:border-foreground/40"),
        )}
        title={`Material deck: ${count} remaining`}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        {playmat ? (
          <>
            <span className="relative z-[1] max-w-[6rem] font-mono text-[9px] font-semibold uppercase leading-tight tracking-[0.1em] text-white/90">
              Material Deck
            </span>
            <span className="relative z-[1] mt-1.5 font-mono text-[14px] font-semibold tabular-nums text-white/80">
              {count}
            </span>
            {playable ? (
              <span className="relative z-[1] mt-1 font-mono text-[8px] uppercase tracking-wide text-accent">
                Play
              </span>
            ) : null}
          </>
        ) : (
          <>
            <span
              className={cn(
                "font-display uppercase tracking-wide",
                compact ? "text-xs" : "text-sm",
              )}
            >
              Materials
            </span>
            <span
              className={cn(
                "font-mono font-semibold tabular-nums leading-none",
                compact ? "mt-0.5 text-lg" : "mt-1 text-2xl",
              )}
            >
              {count}
            </span>
            {playable ? (
              <span className="mt-0.5 font-mono text-[9px] uppercase tracking-wide text-accent">
                Play
              </span>
            ) : null}
          </>
        )}
      </button>

      {typeof document !== "undefined" &&
        createPortal(
          <dialog
            ref={dialogRef}
            className="fixed inset-0 z-50 m-auto max-h-[min(85vh,720px)] w-[min(92vw,560px)] max-w-none rounded-md border border-border bg-surface p-0 shadow-xl backdrop:bg-foreground/35 open:flex open:flex-col"
            aria-labelledby={titleId}
            onCancel={() => {
              setOpen(false);
              setVariantOptions([]);
              setVariantLabel(null);
            }}
            onClose={() => {
              setOpen(false);
              setVariantOptions([]);
              setVariantLabel(null);
            }}
          >
            <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div>
                <h2 id={titleId} className="font-display text-xl leading-none">
                  Material Deck
                </h2>
                {playable ? (
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-wide text-accent">
                    Click a highlighted card to materialize
                  </p>
                ) : null}
              </div>
              <span className="font-mono text-xs text-muted tabular-nums">
                {count} {count === 1 ? "card" : "cards"}
              </span>
            </header>

            {variantOptions.length > 0 ? (
              <div className="border-b border-border px-4 py-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="font-mono text-[10px] uppercase tracking-wide text-muted">
                    Choose {variantLabel ?? "variant"}
                  </p>
                  <button
                    type="button"
                    className="font-mono text-[10px] uppercase tracking-wide text-muted hover:text-foreground"
                    onClick={() => {
                      setVariantOptions([]);
                      setVariantLabel(null);
                    }}
                  >
                    Back
                  </button>
                </div>
                <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                  {variantOptions.map((entry) => (
                    <li key={entry.optionIndex}>
                      <button
                        type="button"
                        className="w-full rounded-sm border border-accent/40 bg-accent/10 px-3 py-2 text-left font-mono text-[12px] text-accent transition-colors hover:bg-accent/20"
                        onClick={() => playOption(entry)}
                      >
                        {entry.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {remaining.length === 0 ? (
                <p className="font-mono text-sm text-muted">
                  Material deck is empty.
                </p>
              ) : (
                <ul className="grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-3">
                  {remaining.map((id) => {
                    const canPlay = (optionsByMaterial.get(id)?.length ?? 0) > 0;
                    return (
                      <li key={id} className="min-w-0">
                        <button
                          type="button"
                          disabled={!canPlay}
                          className={cn(
                            "block w-full border-0 bg-transparent p-0 text-left",
                            canPlay ? "cursor-pointer" : "cursor-default",
                          )}
                          onClick={() => {
                            if (!canPlay) return;
                            activateMaterial(id);
                          }}
                        >
                          <CardTile
                            id={id}
                            highlighted={canPlay}
                            disabled={!canPlay}
                          />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <footer className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3">
              <button
                type="button"
                className="rounded-sm border border-border bg-surface-deep px-3 py-1.5 font-display text-sm uppercase tracking-wide transition-colors hover:border-foreground"
                onClick={() => setOpen(false)}
              >
                Close
              </button>
            </footer>
          </dialog>,
          document.body,
        )}
    </>
  );
}
