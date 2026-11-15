import { describe, expect, it } from "vitest";
import { PotGameEngine, RummyGameEngine, type GameEngine, type PotState, type RummyState } from "./index";

describe("game engine contract", () => {
  it("can describe an engine without coupling to transport", () => {
    const engine: GameEngine = {
      gameType: "POT",
      createInitialState: () => ({ gameType: "POT", phase: "WAITING", version: 0 }),
      applyCommand: (state) => ({ publicState: { ...state, version: state.version + 1 }, privateStates: [], events: [] }),
    };
    expect(engine.createInitialState([]).phase).toBe("WAITING");
    expect(engine.applyCommand(engine.createInitialState([]), {
      type: "noop",
      actorId: "player",
      requestId: "request",
      payload: null,
    }).publicState.version).toBe(1);
  });
});

const command = (type: string, actorId: string, payload: unknown = null) => ({
  type,
  actorId,
  requestId: `${type}-${actorId}`,
  payload,
});

describe("PotGameEngine", () => {
  it("deals a deterministic round and progresses turns to a terminal state", () => {
    const engine = new PotGameEngine();
    const initial = engine.createInitialState(["alice", "bob"]);
    const started = engine.applyCommand(initial, command("start", "alice")).publicState;
    expect(started.phase).toBe("PLAYING");
    expect((started as PotState).pot).toBe(2);
    expect((started as PotState).currentPlayerId).toBe("alice");

    const played = engine.applyCommand(started, command("wager", "alice", { wager: 1 })).publicState;
    expect((played as PotState).currentPlayerId).toBe("bob");
    const finished = engine.applyCommand(played, command("fold", "bob")).publicState;
    expect(finished.phase).toBe("ROUND_COMPLETE");
    expect((finished as PotState).winnerIds).toEqual(["alice"]);
  });

  it("rejects invalid turns and wagers without mutating state", () => {
    const engine = new PotGameEngine();
    const started = engine.applyCommand(engine.createInitialState(["alice", "bob"]), command("start", "alice")).publicState;
    const invalidTurn = engine.applyCommand(started, command("wager", "bob", { wager: 1 }));
    expect(invalidTurn.publicState.version).toBe(started.version);
    expect(invalidTurn.events[0]?.type).toBe("game.error");

    const invalidWager = engine.applyCommand(started, command("wager", "alice", { wager: 101 }));
    expect(invalidWager.publicState.version).toBe(started.version);
    expect((invalidWager.events[0]?.payload as { code: string }).code).toBe("INSUFFICIENT_BALANCE");
  });
});

describe("RummyGameEngine", () => {
  it("deals 13 cards privately and requires draw before discard", () => {
    const engine = new RummyGameEngine();
    const started = engine.applyCommand(engine.createInitialState(["alice", "bob"]), command("start", "alice"));
    const state = started.publicState as RummyState;
    expect(state.phase).toBe("PLAYING");
    expect(state.players.map((player) => player.handSize)).toEqual([13, 13]);
    expect((started.privateStates[0]?.data as { hand: string[] }).hand).toHaveLength(13);

    const invalidDiscard = engine.applyCommand(state, command("discard", "alice", { card: state.hands.alice?.[0] }));
    expect(invalidDiscard.publicState.version).toBe(state.version);
    expect((invalidDiscard.events[0]?.payload as { code: string }).code).toBe("MUST_DRAW");
  });

  it("draws, discards, and rejects declarations that do not form valid melds", () => {
    const engine = new RummyGameEngine();
    const started = engine.applyCommand(engine.createInitialState(["alice", "bob"]), command("start", "alice")).publicState as RummyState;
    const drawn = engine.applyCommand(started, command("draw", "alice", { source: "deck" })).publicState as RummyState;
    const discarded = engine.applyCommand(drawn, command("discard", "alice", { card: drawn.hands.alice?.[0] })).publicState as RummyState;
    expect(discarded.currentPlayerId).toBe("bob");

    const invalidDeclare = engine.applyCommand(discarded, command("declare", "bob"));
    expect(invalidDeclare.publicState.phase).toBe("PLAYING");
    expect((invalidDeclare.events[0]?.payload as { code: string }).code).toBe("INVALID_DECLARATION");
  });

  it("finishes on a valid 13-card declaration", () => {
    const engine = new RummyGameEngine();
    const state = engine.createInitialState(["alice", "bob"]) as RummyState;
    const winningHand = [
      "AC", "2C", "3C", "4C", "5C", "6C",
      "7D", "8D", "9D",
      "QH", "QD", "QC", "QS",
    ] as RummyState["hands"]["alice"];
    state.phase = "PLAYING";
    state.currentPlayerId = "alice";
    state.hands = { alice: winningHand, bob: [] };
    state.players = [{ playerId: "alice", handSize: 13 }, { playerId: "bob", handSize: 0 }];
    const result = engine.applyCommand(state, command("declare", "alice"));
    expect(result.publicState.phase).toBe("ROUND_COMPLETE");
    expect((result.publicState as RummyState).winnerId).toBe("alice");
  });
});
