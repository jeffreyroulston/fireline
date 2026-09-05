/**
 * Framework-free play session state machine (rules `/game/v1` adapter).
 * Payment overlays prompt the UI; legality/apply come from the engine.
 *
 * The engine is stateless per call, so a session is a value: a board, the event
 * log, the legal actions for the current board, an undo stack, and at most one
 * open payment prompt. `sessionReducer` returns the next value plus an optional
 * descriptor of the request the caller should run. Fetching is the caller's
 * job, which is what lets React and an authoritative server share this file.
 */
import type {
  LineEvent,
  PlaytestAction,
  PlaytestActionOption,
  PlaytestApplyRequest,
  PlaytestApplyResult,
  PlaytestEngineState,
  PlaytestInitRequest,
  PlaytestInitResult,
  PlaytestLegalActionsRequest,
  PlaytestLegalActionsResult,
  PlaytestStateView,
} from "@ga-fire/contracts";
import { isPlaySessionDone } from "./enemy";
import {
  discardHandFor,
  discardOptionalFor,
  discardStepDrawnIndex,
  discardStepHand,
  discardStepOptional,
  discardStepsFor,
  drawnDiscardIndexFor,
  needsDiscardPicker,
  withDiscardChoice,
  withDiscardChoices,
} from "./discard";
import {
  excludedIndicesForDiscard,
  maxPlayedCopiesReservable,
  resolveReserveRequirement,
  withReservedHandIndices,
} from "./payment";

export type SessionStatus = "setup" | "playing" | "done";

export type SessionHistoryEntry = Readonly<{
  board: PlaytestStateView;
  events: readonly LineEvent[];
}>;

/** Reserve payment. The player picks exactly `reserveCount` hand slots. */
export type SessionReservePrompt = Readonly<{
  kind: "reserve";
  label: string;
  reserveCount: number;
  fireOnly: boolean;
  playedCard: string | null;
  /** Reserving every copy of `playedCard` is illegal; this is the ceiling. */
  maxPlayedCopies: number;
  hand: readonly string[];
  selected: readonly number[];
}>;

/**
 * One discard decision. Multi-step attack discards reuse this prompt once per
 * attacking ally, with `stepIndex` walking up to `stepCount`.
 */
export type SessionDiscardPrompt = Readonly<{
  kind: "discard";
  label: string;
  hand: readonly string[];
  excludedIndices: readonly number[];
  optional: boolean;
  drawnIndex: number | null;
  stepIndex: number;
  stepCount: number;
  /** Choices already locked in for earlier steps. `null` means skipped. */
  choices: readonly (number | null)[];
}>;

export type SessionPrompt = SessionReservePrompt | SessionDiscardPrompt;

/** The action being assembled while its prompts are answered. */
type PendingStep = Readonly<{
  action: PlaytestAction;
  option: PlaytestActionOption;
  reservedIndices: readonly number[];
}>;

/** The request the caller is currently running, if any. */
type InFlight =
  | Readonly<{ kind: "init" }>
  | Readonly<{ kind: "legalActions" }>
  | Readonly<{ kind: "apply"; snapshot: SessionHistoryEntry }>;

export type SessionState = Readonly<{
  status: SessionStatus;
  board: PlaytestStateView | null;
  events: readonly LineEvent[];
  legalActions: readonly PlaytestActionOption[];
  history: readonly SessionHistoryEntry[];
  prompt: SessionPrompt | null;
  error: string | null;
  pending: PendingStep | null;
  inFlight: InFlight | null;
}>;

export type SessionEffect =
  | Readonly<{ kind: "init"; request: PlaytestInitRequest }>
  | Readonly<{ kind: "legalActions"; request: PlaytestLegalActionsRequest }>
  | Readonly<{ kind: "apply"; request: PlaytestApplyRequest }>;

export type SessionTransition = Readonly<{
  state: SessionState;
  effect: SessionEffect | null;
}>;

export type SessionEvent =
  | Readonly<{ type: "start"; request: PlaytestInitRequest }>
  | Readonly<{ type: "initSucceeded"; result: PlaytestInitResult }>
  | Readonly<{
      type: "legalActionsSucceeded";
      result: PlaytestLegalActionsResult;
    }>
  | Readonly<{ type: "applySucceeded"; result: PlaytestApplyResult }>
  | Readonly<{ type: "requestFailed"; message: string }>
  | Readonly<{ type: "selectAction"; option: PlaytestActionOption }>
  | Readonly<{ type: "toggleReserve"; handIndex: number }>
  | Readonly<{ type: "confirmReserve" }>
  | Readonly<{ type: "chooseDiscard"; handIndex: number }>
  | Readonly<{ type: "skipDiscard" }>
  | Readonly<{ type: "cancelPrompt" }>
  | Readonly<{ type: "undo" }>
  | Readonly<{ type: "setError"; message: string | null }>
  | Readonly<{ type: "reset" }>;

export const initialSessionState: SessionState = {
  status: "setup",
  board: null,
  events: [],
  legalActions: [],
  history: [],
  prompt: null,
  error: null,
  pending: null,
  inFlight: null,
};

export function isSessionBusy(state: SessionState): boolean {
  return state.inFlight !== null;
}

export function canUndoSession(state: SessionState): boolean {
  return state.history.length > 0 && state.inFlight === null;
}

/** True once the player has picked enough hand slots to pay a reserve prompt. */
export function isReserveSelectionComplete(
  prompt: SessionReservePrompt,
): boolean {
  return prompt.selected.length === prompt.reserveCount;
}

function stay(state: SessionState): SessionTransition {
  return { state, effect: null };
}

function legalActionsEffect(engine: PlaytestEngineState): SessionEffect {
  return { kind: "legalActions", request: { state: engine } };
}

/** Drop any open prompt and the half-assembled action behind it. */
function clearPrompt(state: SessionState): SessionState {
  return { ...state, prompt: null, pending: null };
}

/**
 * Board reached after a successful init, apply, or undo. The old legal actions
 * describe the old board, so they are always dropped; terminal boards have none
 * at all and so need no follow-up request.
 */
function settleBoard(
  state: SessionState,
  board: PlaytestStateView,
  events: readonly LineEvent[],
  history: readonly SessionHistoryEntry[],
): SessionTransition {
  const done = isPlaySessionDone(board);
  const next: SessionState = {
    ...state,
    status: done ? "done" : "playing",
    board,
    events,
    history,
    legalActions: [],
    prompt: null,
    pending: null,
    error: null,
    inFlight: done ? null : { kind: "legalActions" },
  };
  return {
    state: next,
    effect: done ? null : legalActionsEffect(board.engine),
  };
}

/** Send the assembled action and remember the board it was played from. */
function beginApply(
  state: SessionState,
  board: PlaytestStateView,
  action: PlaytestAction,
): SessionTransition {
  const snapshot: SessionHistoryEntry = { board, events: state.events };
  return {
    state: {
      ...clearPrompt(state),
      error: null,
      inFlight: { kind: "apply", snapshot },
    },
    effect: { kind: "apply", request: { state: board.engine, action } },
  };
}

/**
 * The heart of prompt sequencing. An option carries either a list of discard
 * steps (one per attacking ally) or a single optional discard, or neither. Open
 * a prompt for the step at `stepIndex`; once the steps run out, apply.
 */
function openDiscardOrApply(
  state: SessionState,
  board: PlaytestStateView,
  step: PendingStep,
  stepIndex: number,
  priorChoices: readonly (number | null)[],
): SessionTransition {
  const steps = discardStepsFor(step.option);
  if (steps.length > 0) {
    const current = steps[stepIndex];
    if (!current) {
      return beginApply(
        state,
        board,
        withDiscardChoices(step.action, [...priorChoices]),
      );
    }
    const hand = discardStepHand(current);
    return stay({
      ...state,
      pending: step,
      error: null,
      prompt: {
        kind: "discard",
        label: current.label,
        hand,
        excludedIndices: excludedIndicesForDiscard(
          hand,
          step.option.playedCard,
          [...step.reservedIndices],
        ),
        optional: discardStepOptional(current),
        drawnIndex: discardStepDrawnIndex(current),
        stepIndex,
        stepCount: steps.length,
        choices: priorChoices,
      },
    });
  }

  if (!needsDiscardPicker(step.option)) {
    return beginApply(state, board, step.action);
  }

  const hand = discardHandFor(step.option);
  return stay({
    ...state,
    pending: step,
    error: null,
    prompt: {
      kind: "discard",
      label: step.option.label,
      hand,
      excludedIndices: excludedIndicesForDiscard(hand, step.option.playedCard, [
        ...step.reservedIndices,
      ]),
      optional: discardOptionalFor(step.option),
      drawnIndex: drawnDiscardIndexFor(step.option),
      stepIndex: 0,
      stepCount: 1,
      choices: [],
    },
  });
}

/** Record a discard choice, then either open the next step or apply. */
function advanceDiscard(
  state: SessionState,
  board: PlaytestStateView,
  step: PendingStep,
  choices: readonly (number | null)[],
): SessionTransition {
  const steps = discardStepsFor(step.option);
  if (steps.length > 0 && choices.length < steps.length) {
    return openDiscardOrApply(state, board, step, choices.length, choices);
  }
  const action =
    steps.length > 0
      ? withDiscardChoices(step.action, [...choices])
      : withDiscardChoice(
          step.action,
          choices[0] === null ? { skip: true } : { handIndex: choices[0] ?? 0 },
        );
  return beginApply(state, board, action);
}

function reduceSelectAction(
  state: SessionState,
  option: PlaytestActionOption,
): SessionTransition {
  const board = state.board;
  if (!board || state.inFlight !== null) {
    return stay(state);
  }
  const step: PendingStep = {
    action: option.action,
    option,
    reservedIndices: [],
  };
  const requirement = resolveReserveRequirement(option.action, option, board);
  if (requirement.reserveCount > 0) {
    return stay({
      ...state,
      pending: step,
      error: null,
      prompt: {
        kind: "reserve",
        label: option.label,
        reserveCount: requirement.reserveCount,
        fireOnly: requirement.fireOnly,
        playedCard: requirement.playedCard,
        maxPlayedCopies: maxPlayedCopiesReservable(
          board.hand,
          requirement.playedCard,
        ),
        hand: board.hand,
        selected: [],
      },
    });
  }
  return openDiscardOrApply(state, board, step, 0, []);
}

function reduceConfirmReserve(state: SessionState): SessionTransition {
  const prompt = state.prompt;
  const step = state.pending;
  const board = state.board;
  if (
    !board ||
    !step ||
    prompt?.kind !== "reserve" ||
    !isReserveSelectionComplete(prompt)
  ) {
    return stay(state);
  }
  const reservedIndices = [...prompt.selected];
  return openDiscardOrApply(
    state,
    board,
    {
      ...step,
      action: withReservedHandIndices(step.action, reservedIndices),
      reservedIndices,
    },
    0,
    [],
  );
}

function reduceDiscardChoice(
  state: SessionState,
  choice: number | null,
): SessionTransition {
  const prompt = state.prompt;
  const step = state.pending;
  const board = state.board;
  if (!board || !step || prompt?.kind !== "discard") {
    return stay(state);
  }
  if (choice === null && !prompt.optional) {
    return stay(state);
  }
  return advanceDiscard(state, board, step, [...prompt.choices, choice]);
}

function reduceUndo(state: SessionState): SessionTransition {
  const previous = state.history[state.history.length - 1];
  if (!previous || state.inFlight !== null) {
    return stay(state);
  }
  return settleBoard(
    state,
    previous.board,
    previous.events,
    state.history.slice(0, -1),
  );
}

export function sessionReducer(
  state: SessionState,
  event: SessionEvent,
): SessionTransition {
  switch (event.type) {
    case "start":
      return {
        state: {
          ...initialSessionState,
          status: "setup",
          inFlight: { kind: "init" },
        },
        effect: { kind: "init", request: event.request },
      };

    case "initSucceeded": {
      if (state.inFlight?.kind !== "init") {
        return stay(state);
      }
      return settleBoard(state, event.result.state, event.result.events, []);
    }

    case "legalActionsSucceeded": {
      if (state.inFlight?.kind !== "legalActions") {
        return stay(state);
      }
      return stay({
        ...state,
        legalActions: event.result.actions,
        inFlight: null,
      });
    }

    case "applySucceeded": {
      const inFlight = state.inFlight;
      if (inFlight?.kind !== "apply") {
        return stay(state);
      }
      return settleBoard(
        state,
        event.result.state,
        [...state.events, ...event.result.events],
        [...state.history, inFlight.snapshot],
      );
    }

    case "requestFailed":
      return stay({ ...state, error: event.message, inFlight: null });

    case "selectAction":
      return reduceSelectAction(state, event.option);

    case "toggleReserve": {
      const prompt = state.prompt;
      if (prompt?.kind !== "reserve") {
        return stay(state);
      }
      const selected = prompt.selected.includes(event.handIndex)
        ? prompt.selected.filter((index) => index !== event.handIndex)
        : [...prompt.selected, event.handIndex];
      return stay({ ...state, prompt: { ...prompt, selected } });
    }

    case "confirmReserve":
      return reduceConfirmReserve(state);

    case "chooseDiscard":
      return reduceDiscardChoice(state, event.handIndex);

    case "skipDiscard":
      return reduceDiscardChoice(state, null);

    case "cancelPrompt":
      return stay({ ...clearPrompt(state), error: null });

    case "undo":
      return reduceUndo(state);

    case "setError":
      return stay({ ...state, error: event.message });

    case "reset":
      return stay(initialSessionState);
  }
}
