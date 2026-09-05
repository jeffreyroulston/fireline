import { describe, expect, it } from "vitest";
import type {
  PlaytestAction,
  PlaytestActionOption,
  PlaytestApplyRequest,
  PlaytestEngineState,
  PlaytestInitRequest,
  PlaytestStateView,
} from "@ga-fire/contracts";
import {
  canUndoSession,
  initialSessionState,
  isSessionBusy,
  sessionReducer,
  type SessionEvent,
  type SessionState,
  type SessionTransition,
} from "./session";

const BASE_ENGINE: PlaytestEngineState = {
  hand: [],
  memory: [],
  handLen: 0,
  memoryLen: 0,
  allies: [],
  allyLen: 0,
  turn: 1,
  maxTurns: 3,
  phase: 0,
  fireGy: 0,
  floatGy: 0,
  gyTotal: 0,
  marchHareGy: 0,
  gy: [],
  banished: [],
  banishedTotal: 0,
  ringBanished: false,
  championLevel: 1,
  tristanLeveled: false,
  championAwake: true,
  championDamaged: false,
  prep: 0,
  agility: 0,
  weapons: [],
  weaponPowerBonus: 0,
  dagger: false,
  daggerReady: false,
  ring: false,
  amplify: false,
  materials: 0,
  hotCake: 0,
  goFirst: true,
  queuePos: 0,
  damage: 0,
  queue: [],
  queueLen: 0,
};

function boardFixture(
  overrides: Partial<PlaytestStateView> = {},
): PlaytestStateView {
  return {
    engine: { ...BASE_ENGINE },
    hand: ["clumsy_apprentice", "ignited_stab", "woodland_squirrels"],
    memory: [],
    allies: [],
    weapons: [],
    gy: {},
    banished: {},
    ringBanished: false,
    phase: "main",
    turn: 1,
    maxTurns: 3,
    damage: 0,
    fireGy: 0,
    floatGy: 0,
    championLevel: 1,
    tristanLeveled: false,
    championAwake: true,
    championDamaged: false,
    prep: 0,
    agility: 0,
    dagger: false,
    daggerReady: false,
    ring: false,
    amplify: false,
    queueRemaining: 5,
    terminal: false,
    glimpsePeek: [],
    glimpseLayouts: [],
    ...overrides,
  };
}

function optionFixture(
  action: PlaytestAction,
  overrides: Partial<PlaytestActionOption> = {},
): PlaytestActionOption {
  return {
    action,
    label: "Option",
    reserveCount: 0,
    fireOnly: false,
    playedCard: null,
    discardOptional: false,
    discardHand: [],
    drawnDiscardIndex: null,
    discardSteps: [],
    ...overrides,
  };
}

function playAlly(card: string, kindle = 0): PlaytestAction {
  return {
    op: "playAlly",
    card,
    kindle,
    sacrifice_ally: null,
    hot_cake_sacrifice: false,
    flagrant_level: null,
    flagrant_gy_return: null,
    tristan_agility: false,
    reserved: [],
    reserved_hand_indices: [],
    skip_discard: null,
    discard_hand_index: null,
  };
}

function attackOthers(): PlaytestAction {
  return {
    op: "attackOthers",
    skip_discard: null,
    discard_hand_index: null,
    discard_hand_indices: [],
  };
}

type DiscardStepFixture = PlaytestActionOption["discardSteps"][number];

function discardStep(
  label: string,
  overrides: Partial<DiscardStepFixture> = {},
): DiscardStepFixture {
  return {
    label,
    discardOptional: false,
    discardHand: ["clumsy_apprentice", "ignited_stab"],
    drawnDiscardIndex: null,
    ...overrides,
  };
}

const INIT_REQUEST: PlaytestInitRequest = {
  hand: ["clumsy_apprentice", "ignited_stab", "woodland_squirrels"],
  goFirst: true,
  maxTurns: 3,
  materials: {},
  queue: ["brick"],
};

/** Fold a list of events, asserting nothing, and keep the last transition. */
function run(
  state: SessionState,
  events: readonly SessionEvent[],
): SessionTransition {
  return events.reduce<SessionTransition>(
    (current, event) => sessionReducer(current.state, event),
    { state, effect: null },
  );
}

/** Drive a session up to a live board with `legalActions` loaded. */
function playing(
  board: PlaytestStateView,
  legalActions: readonly PlaytestActionOption[] = [],
): SessionState {
  return run(initialSessionState, [
    { type: "start", request: INIT_REQUEST },
    { type: "initSucceeded", result: { state: board, events: [] } },
    { type: "legalActionsSucceeded", result: { actions: [...legalActions] } },
  ]).state;
}

function applyRequest(transition: SessionTransition): PlaytestApplyRequest {
  if (transition.effect?.kind !== "apply") {
    throw new Error(`expected an apply effect, got ${transition.effect?.kind}`);
  }
  return transition.effect.request;
}

describe("start and init", () => {
  it("asks the caller to init, then to fetch legal actions", () => {
    const started = sessionReducer(initialSessionState, {
      type: "start",
      request: INIT_REQUEST,
    });
    expect(started.effect).toEqual({ kind: "init", request: INIT_REQUEST });
    expect(isSessionBusy(started.state)).toBe(true);

    const board = boardFixture();
    const ready = sessionReducer(started.state, {
      type: "initSucceeded",
      result: { state: board, events: [] },
    });
    expect(ready.state.status).toBe("playing");
    expect(ready.state.board).toBe(board);
    expect(ready.effect).toEqual({
      kind: "legalActions",
      request: { state: board.engine },
    });
  });

  it("surfaces a failed request and stops being busy", () => {
    const started = sessionReducer(initialSessionState, {
      type: "start",
      request: INIT_REQUEST,
    });
    const failed = sessionReducer(started.state, {
      type: "requestFailed",
      message: "worker offline",
    });
    expect(failed.state.error).toBe("worker offline");
    expect(isSessionBusy(failed.state)).toBe(false);
  });

  it("ignores a result that does not match the in-flight request", () => {
    const state = playing(boardFixture());
    const stale = sessionReducer(state, {
      type: "applySucceeded",
      result: { state: boardFixture({ damage: 99 }), events: [] },
    });
    expect(stale.state).toBe(state);
    expect(stale.effect).toBeNull();
  });
});

describe("plain action", () => {
  it("applies immediately with no prompt", () => {
    const board = boardFixture();
    const option = optionFixture({ op: "pass" }, { label: "Pass" });
    const chosen = sessionReducer(playing(board, [option]), {
      type: "selectAction",
      option,
    });

    expect(chosen.state.prompt).toBeNull();
    expect(applyRequest(chosen)).toEqual({
      state: board.engine,
      action: { op: "pass" },
    });
  });

  it("appends events and keeps a snapshot for undo", () => {
    const board = boardFixture();
    const option = optionFixture({ op: "pass" });
    const chosen = sessionReducer(playing(board, [option]), {
      type: "selectAction",
      option,
    });
    const next = boardFixture({ damage: 4 });
    const applied = sessionReducer(chosen.state, {
      type: "applySucceeded",
      result: { state: next, events: [] },
    });

    expect(applied.state.board).toBe(next);
    expect(applied.state.history).toHaveLength(1);
    expect(applied.state.history[0]?.board).toBe(board);
    expect(applied.state.legalActions).toEqual([]);
    expect(applied.effect).toEqual({
      kind: "legalActions",
      request: { state: next.engine },
    });
  });

  it("does not stop on an engine-terminal board before the enemy is defeated", () => {
    const option = optionFixture({ op: "pass" });
    const chosen = sessionReducer(playing(boardFixture(), [option]), {
      type: "selectAction",
      option,
    });
    const applied = sessionReducer(chosen.state, {
      type: "applySucceeded",
      result: {
        state: boardFixture({ terminal: true, damage: 4 }),
        events: [],
      },
    });

    expect(applied.state.status).toBe("playing");
    expect(applied.effect).toEqual({
      kind: "legalActions",
      request: { state: applied.state.board!.engine },
    });
  });

  it("stops when enemy champion life is reached even if the engine line continues", () => {
    const option = optionFixture({ op: "pass" });
    const chosen = sessionReducer(playing(boardFixture(), [option]), {
      type: "selectAction",
      option,
    });
    const applied = sessionReducer(chosen.state, {
      type: "applySucceeded",
      result: {
        state: boardFixture({ damage: 15, terminal: false }),
        events: [],
      },
    });

    expect(applied.state.status).toBe("done");
    expect(applied.effect).toBeNull();
  });
});

describe("reserve prompt", () => {
  const option = optionFixture(playAlly("clumsy_apprentice"), {
    label: "Play Clumsy Apprentice",
    reserveCount: 2,
    playedCard: "clumsy_apprentice",
  });

  it("opens a reserve prompt carrying the played-copy ceiling", () => {
    const board = boardFixture({
      hand: ["clumsy_apprentice", "clumsy_apprentice", "ignited_stab"],
    });
    const chosen = sessionReducer(playing(board, [option]), {
      type: "selectAction",
      option,
    });

    expect(chosen.effect).toBeNull();
    expect(chosen.state.prompt).toMatchObject({
      kind: "reserve",
      reserveCount: 2,
      fireOnly: false,
      playedCard: "clumsy_apprentice",
      maxPlayedCopies: 1,
      selected: [],
    });
  });

  it("does not apply until the selection is complete", () => {
    const chosen = sessionReducer(playing(boardFixture(), [option]), {
      type: "selectAction",
      option,
    });
    const partial = run(chosen.state, [
      { type: "toggleReserve", handIndex: 1 },
      { type: "confirmReserve" },
    ]);

    expect(partial.effect).toBeNull();
    expect(partial.state.prompt).toMatchObject({ kind: "reserve" });
  });

  it("toggles a slot off when picked twice", () => {
    const chosen = sessionReducer(playing(boardFixture(), [option]), {
      type: "selectAction",
      option,
    });
    const toggled = run(chosen.state, [
      { type: "toggleReserve", handIndex: 1 },
      { type: "toggleReserve", handIndex: 2 },
      { type: "toggleReserve", handIndex: 1 },
    ]);

    expect(toggled.state.prompt).toMatchObject({ selected: [2] });
  });

  it("sends the reserved hand slots once confirmed", () => {
    const board = boardFixture();
    const chosen = sessionReducer(playing(board, [option]), {
      type: "selectAction",
      option,
    });
    const confirmed = run(chosen.state, [
      { type: "toggleReserve", handIndex: 1 },
      { type: "toggleReserve", handIndex: 2 },
      { type: "confirmReserve" },
    ]);

    expect(confirmed.state.prompt).toBeNull();
    expect(applyRequest(confirmed).action).toMatchObject({
      op: "playAlly",
      card: "clumsy_apprentice",
      reserved: [],
      reserved_hand_indices: [1, 2],
    });
  });

  it("restricts the prompt to Fire cards when the option says so", () => {
    const imbued = optionFixture(
      {
        op: "playAction",
        card: "blazing_throw",
        kindle: 0,
        prepared: false,
        imbue: true,
        sacrifice_ally: null,
        reserved: [],
        reserved_hand_indices: [],
      },
      { reserveCount: 1, fireOnly: true, playedCard: "blazing_throw" },
    );
    const chosen = sessionReducer(playing(boardFixture(), [imbued]), {
      type: "selectAction",
      option: imbued,
    });

    expect(chosen.state.prompt).toMatchObject({ fireOnly: true });
  });

  it("cancelling drops the prompt and the half-built action", () => {
    const chosen = sessionReducer(playing(boardFixture(), [option]), {
      type: "selectAction",
      option,
    });
    const cancelled = sessionReducer(chosen.state, { type: "cancelPrompt" });

    expect(cancelled.state.prompt).toBeNull();
    expect(cancelled.state.pending).toBeNull();
    expect(cancelled.effect).toBeNull();
  });

  it("still charges an option that reports no reserve but implies one", () => {
    const bare = optionFixture(playAlly("clumsy_apprentice"));
    const chosen = sessionReducer(playing(boardFixture(), [bare]), {
      type: "selectAction",
      option: bare,
    });

    expect(chosen.effect).toBeNull();
    expect(chosen.state.prompt).toMatchObject({
      kind: "reserve",
      reserveCount: 2,
      playedCard: "clumsy_apprentice",
    });
  });

  it("charges nothing once kindle covers the cost", () => {
    const kindled = optionFixture(playAlly("clumsy_apprentice", 2), {
      playedCard: "clumsy_apprentice",
    });
    const board = boardFixture({ fireGy: 2 });
    const chosen = sessionReducer(playing(board, [kindled]), {
      type: "selectAction",
      option: kindled,
    });

    expect(chosen.state.prompt).toBeNull();
    expect(applyRequest(chosen).action).toMatchObject({ kindle: 2 });
  });
});

describe("optional single discard", () => {
  const option = optionFixture(playAlly("woodland_squirrels"), {
    label: "Play Woodland Squirrels",
    playedCard: "woodland_squirrels",
    discardOptional: true,
    discardHand: ["woodland_squirrels", "ignited_stab", "brick"],
    drawnDiscardIndex: 2,
  });

  it("opens one prompt that excludes the copy being played", () => {
    const chosen = sessionReducer(playing(boardFixture(), [option]), {
      type: "selectAction",
      option,
    });

    expect(chosen.effect).toBeNull();
    expect(chosen.state.prompt).toMatchObject({
      kind: "discard",
      optional: true,
      drawnIndex: 2,
      stepIndex: 0,
      stepCount: 1,
      excludedIndices: [0],
      choices: [],
    });
  });

  it("sends the chosen slot", () => {
    const chosen = sessionReducer(playing(boardFixture(), [option]), {
      type: "selectAction",
      option,
    });
    const discarded = sessionReducer(chosen.state, {
      type: "chooseDiscard",
      handIndex: 1,
    });

    expect(applyRequest(discarded).action).toMatchObject({
      op: "playAlly",
      skip_discard: null,
      discard_hand_index: 1,
    });
  });

  it("sends a skip when the player declines", () => {
    const chosen = sessionReducer(playing(boardFixture(), [option]), {
      type: "selectAction",
      option,
    });
    const skipped = sessionReducer(chosen.state, { type: "skipDiscard" });

    expect(applyRequest(skipped).action).toMatchObject({
      op: "playAlly",
      skip_discard: true,
      discard_hand_index: null,
    });
  });

  it("will not skip a mandatory discard", () => {
    const mandatory = optionFixture(playAlly("woodland_squirrels"), {
      discardHand: ["ignited_stab", "brick"],
    });
    const chosen = sessionReducer(playing(boardFixture(), [mandatory]), {
      type: "selectAction",
      option: mandatory,
    });
    const skipped = sessionReducer(chosen.state, { type: "skipDiscard" });

    expect(skipped.effect).toBeNull();
    expect(skipped.state.prompt).toMatchObject({ kind: "discard" });
  });
});

describe("two-step attack discard", () => {
  const option = optionFixture(attackOthers(), {
    label: "Attack with all allies",
    discardSteps: [
      discardStep("Discard for Ally 1"),
      discardStep("Discard for Ally 2", {
        discardOptional: true,
        discardHand: ["clumsy_apprentice", "ignited_stab", "brick"],
        drawnDiscardIndex: 2,
      }),
    ],
  });

  it("walks one prompt per attacking ally, then applies", () => {
    const first = sessionReducer(playing(boardFixture(), [option]), {
      type: "selectAction",
      option,
    });
    expect(first.effect).toBeNull();
    expect(first.state.prompt).toMatchObject({
      kind: "discard",
      label: "Discard for Ally 1",
      optional: false,
      stepIndex: 0,
      stepCount: 2,
      choices: [],
    });

    const second = sessionReducer(first.state, {
      type: "chooseDiscard",
      handIndex: 0,
    });
    expect(second.effect).toBeNull();
    expect(second.state.prompt).toMatchObject({
      kind: "discard",
      label: "Discard for Ally 2",
      optional: true,
      drawnIndex: 2,
      stepIndex: 1,
      stepCount: 2,
      choices: [0],
    });

    const done = sessionReducer(second.state, {
      type: "chooseDiscard",
      handIndex: 1,
    });
    expect(applyRequest(done).action).toMatchObject({
      op: "attackOthers",
      skip_discard: null,
      discard_hand_index: null,
      discard_hand_indices: [0, 1],
    });
  });

  it("records a skipped step as null", () => {
    const first = sessionReducer(playing(boardFixture(), [option]), {
      type: "selectAction",
      option,
    });
    const done = run(first.state, [
      { type: "chooseDiscard", handIndex: 1 },
      { type: "skipDiscard" },
    ]);

    expect(applyRequest(done).action).toMatchObject({
      discard_hand_indices: [1, null],
    });
  });

});

describe("reserve followed by a discard", () => {
  const hand = ["clumsy_apprentice", "ignited_stab", "brick", "brick"];
  const option = optionFixture(playAlly("clumsy_apprentice"), {
    label: "Play Clumsy Apprentice",
    reserveCount: 2,
    playedCard: "clumsy_apprentice",
    discardHand: hand,
  });

  it("opens the discard prompt only after the reserve is paid", () => {
    const chosen = sessionReducer(playing(boardFixture({ hand }), [option]), {
      type: "selectAction",
      option,
    });
    expect(chosen.state.prompt).toMatchObject({ kind: "reserve" });

    const confirmed = run(chosen.state, [
      { type: "toggleReserve", handIndex: 2 },
      { type: "toggleReserve", handIndex: 3 },
      { type: "confirmReserve" },
    ]);

    expect(confirmed.effect).toBeNull();
    expect(confirmed.state.prompt).toMatchObject({
      kind: "discard",
      stepIndex: 0,
      stepCount: 1,
      excludedIndices: [2, 3, 0],
    });
  });

  it("keeps the reserved slots on the action it finally sends", () => {
    const sent = run(playing(boardFixture({ hand }), [option]), [
      { type: "selectAction", option },
      { type: "toggleReserve", handIndex: 2 },
      { type: "toggleReserve", handIndex: 3 },
      { type: "confirmReserve" },
      { type: "chooseDiscard", handIndex: 1 },
    ]);

    expect(applyRequest(sent).action).toMatchObject({
      op: "playAlly",
      card: "clumsy_apprentice",
      reserved_hand_indices: [2, 3],
      discard_hand_index: 1,
      skip_discard: null,
    });
  });
});

describe("undo", () => {
  it("restores the prior board and event log", () => {
    const board = boardFixture();
    const option = optionFixture({ op: "pass" });
    const opened = playing(board, [option]);
    const next = boardFixture({ damage: 7, turn: 2 });

    const applied = run(opened, [
      { type: "selectAction", option },
      { type: "applySucceeded", result: { state: next, events: [] } },
      { type: "legalActionsSucceeded", result: { actions: [] } },
    ]);
    expect(applied.state.board).toBe(next);
    expect(canUndoSession(applied.state)).toBe(true);

    const undone = sessionReducer(applied.state, { type: "undo" });
    expect(undone.state.board).toBe(board);
    expect(undone.state.history).toEqual([]);
    expect(canUndoSession(undone.state)).toBe(false);
    expect(undone.effect).toEqual({
      kind: "legalActions",
      request: { state: board.engine },
    });
  });

  it("does nothing with an empty history", () => {
    const state = playing(boardFixture());
    const undone = sessionReducer(state, { type: "undo" });

    expect(undone.state).toBe(state);
    expect(undone.effect).toBeNull();
  });

  it("clears an open prompt and restores a prior kill as done", () => {
    const board = boardFixture({ damage: 15 });
    const option = optionFixture({ op: "pass" });
    const applied = run(playing(board, [option]), [
      { type: "selectAction", option },
      {
        type: "applySucceeded",
        result: { state: boardFixture({ damage: 16 }), events: [] },
      },
    ]);

    const undone = sessionReducer(applied.state, { type: "undo" });
    expect(undone.state.status).toBe("done");
    expect(undone.state.prompt).toBeNull();
    expect(undone.state.legalActions).toEqual([]);
    expect(undone.effect).toBeNull();
  });
});

describe("reset", () => {
  it("returns to the setup state", () => {
    const state = playing(boardFixture(), [optionFixture({ op: "pass" })]);
    const reset = sessionReducer(state, { type: "reset" });

    expect(reset.state).toEqual(initialSessionState);
    expect(reset.effect).toBeNull();
  });
});
