import { describe, expect, it } from "vitest";
import { PokerDomainError, PokerEngine, evaluateHand, type Card } from "./poker";

describe("Poker engine", () => {
  it("deals unique private cards and exposes only public projections", () => {
    const engine = new PokerEngine({ randomIndex: () => 0 });
    const state = engine.createInitialState(["alice", "bob"]);
    const result = engine.applyCommand(state, command("alice", "start"));

    expect(result.publicState.phase).toBe("PREFLOP");
    expect(result.publicState.board).toHaveLength(0);
    expect(result.publicState.players.every((player) => player.hasCards)).toBe(true);
    expect(JSON.stringify(result.publicState)).not.toContain("holeCards");
    expect(result.privateStates).toHaveLength(2);
    expect(new Set(result.privateStates.flatMap((entry) => (entry.data as { holeCards: Card[] }).holeCards.map(cardKey))).size).toBe(4);
  });

  it("enforces turn order and check/call validation", () => {
    const engine = new PokerEngine({ randomIndex: () => 0 });
    const state = engine.createInitialState(["alice", "bob"]);
    engine.applyCommand(state, command("alice", "start"));

    expect(() => engine.applyCommand(state, command("alice", "check"))).toThrow(PokerDomainError);
    expect(() => engine.applyCommand(state, command("bob", "call"))).toThrow(PokerDomainError);
  });

  it("settles a deterministic showdown with the best five-card hand", () => {
    const engine = new PokerEngine({ randomIndex: () => 0 });
    const state = engine.createInitialState(["alice", "bob"]);
    state.phase = "RIVER";
    state.handStarted = true;
    state.board = [
      { rank: 14, suit: "S" }, { rank: 13, suit: "S" }, { rank: 12, suit: "S" },
      { rank: 2, suit: "C" }, { rank: 7, suit: "D" },
    ];
    state.playersInternal[0]!.holeCards = [{ rank: 11, suit: "S" }, { rank: 10, suit: "S" }];
    state.playersInternal[1]!.holeCards = [{ rank: 14, suit: "C" }, { rank: 14, suit: "D" }];
    state.playersInternal[0]!.committed = 100;
    state.playersInternal[1]!.committed = 100;
    state.playersInternal[0]!.stack = 900;
    state.playersInternal[1]!.stack = 900;
    state.playersInternal[1]!.allIn = true;
    state.playersInternal[1]!.stack = 0;
    state.currentPlayerIndex = 0;
    const result = engine.applyCommand(state, command("alice", "check"));

    expect(result.publicState.phase).toBe("COMPLETE");
    expect(result.publicState.winners).toEqual(["alice"]);
    expect(result.publicState.players.find((player) => player.id === "alice")?.stack).toBe(1_100);
  });

  it("ranks wheel straights below higher straights", () => {
    const wheel: Card[] = [
      { rank: 14, suit: "S" }, { rank: 2, suit: "C" }, { rank: 3, suit: "D" },
      { rank: 4, suit: "H" }, { rank: 5, suit: "S" }, { rank: 9, suit: "C" }, { rank: 13, suit: "D" },
    ];
    const sixHigh: Card[] = [...wheel.slice(1, 5), { rank: 6, suit: "C" }, { rank: 9, suit: "H" }, { rank: 13, suit: "D" }];
    expect(evaluateHand(wheel)[0]).toBe(4);
    expect(evaluateHand(wheel)[1]).toBe(5);
    expect(evaluateHand(sixHigh)[1]).toBe(6);
  });

  it("builds side pots and awards each eligible pot independently", () => {
    const engine = new PokerEngine();
    const state = engine.createInitialState(["alice", "bob", "charlie"]);
    state.phase = "RIVER";
    state.handStarted = true;
    state.board = [
      { rank: 14, suit: "S" }, { rank: 13, suit: "S" }, { rank: 12, suit: "S" },
      { rank: 2, suit: "C" }, { rank: 7, suit: "D" },
    ];
    state.playersInternal[0]!.holeCards = [{ rank: 11, suit: "S" }, { rank: 10, suit: "S" }];
    state.playersInternal[1]!.holeCards = [{ rank: 14, suit: "C" }, { rank: 14, suit: "D" }];
    state.playersInternal[2]!.holeCards = [{ rank: 13, suit: "C" }, { rank: 13, suit: "D" }];
    state.playersInternal[1]!.allIn = true;
    state.playersInternal[2]!.allIn = true;
    state.playersInternal[0]!.committed = 100;
    state.playersInternal[1]!.committed = 50;
    state.playersInternal[2]!.committed = 100;
    state.playersInternal[0]!.stack = 900;
    state.playersInternal[1]!.stack = 950;
    state.playersInternal[2]!.stack = 900;
    state.currentPlayerIndex = 0;

    const result = engine.applyCommand(state, command("alice", "check"));

    expect(result.publicState.winners).toEqual(["alice"]);
    expect(result.publicState.players.find((player) => player.id === "alice")?.stack).toBe(1_150);
    expect(result.publicState.players.find((player) => player.id === "bob")?.stack).toBe(950);
  });
});

function command(actorId: string, type: string, amount?: number) {
  return { actorId, type, requestId: `${actorId}-${type}`, payload: amount === undefined ? null : { amount } };
}

function cardKey(card: Card) {
  return `${card.rank}${card.suit}`;
}
