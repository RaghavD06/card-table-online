import { describe, expect, it } from "vitest";
import {
  RummyDomainError,
  RummyEngine,
  classifyGroup,
  validateDeclaration,
  type RummyCard,
} from "./rummy";

describe("Indian 13-card rummy engine", () => {
  it("deals 13 private cards and exposes only counts publicly", () => {
    const engine = new RummyEngine({ randomIndex: () => 0 });
    const state = engine.createInitialState(["alice", "bob"]);
    const result = engine.applyCommand(state, command("alice", "start"));

    expect(result.publicState.phase).toBe("DRAW");
    expect(result.publicState.players.map((player) => player.cardCount)).toEqual([13, 13]);
    expect(JSON.stringify(result.publicState)).not.toContain("hand");
    expect((result.privateStates[0]!.data as { hand: RummyCard[] }).hand).toHaveLength(13);
    expect(new Set(result.privateStates.flatMap((entry) => (entry.data as { hand: RummyCard[] }).hand.map((card) => card.id))).size)
      .toBe(26);
  });

  it("enforces draw, discard, and turn order", () => {
    const engine = new RummyEngine({ randomIndex: () => 0 });
    const state = engine.createInitialState(["alice", "bob"]);
    engine.applyCommand(state, command("alice", "start"));

    expect(() => engine.applyCommand(state, command("bob", "draw", { from: "stock" }))).toThrow(RummyDomainError);
    engine.applyCommand(state, command("alice", "draw", { from: "stock" }));
    const card = state.playersInternal[0]!.hand[13]!;
    engine.applyCommand(state, command("alice", "discard", { cardId: card.id }));
    expect(state.playersInternal[state.currentPlayerIndex ?? -1]?.id).toBe("bob");
  });

  it("recognizes pure and impure sequences and sets", () => {
    expect(classifyGroup(cards(["3C", "4C", "5C"]), 13)).toBe("PURE_SEQUENCE");
    expect(classifyGroup(cards(["3C", "13C", "5C"]), 13)).toBe("IMPURE_SEQUENCE");
    expect(classifyGroup(cards(["7C", "7D", "7H"]), 13)).toBe("SET");
    expect(classifyGroup(cards(["3C", "4D", "5C"]), 13)).toBe("INVALID");
  });

  it("requires a pure sequence and two sequences for declaration", () => {
    const hand = cards([
      "3C", "4C", "5C",
      "7D", "7H", "7S",
      "9S", "9H", "9D",
      "10S", "10H", "10D", "10C",
    ]);
    const valid = validateDeclaration(hand, [
      { cardIds: ["3C", "4C", "5C"] },
      { cardIds: ["7D", "7H", "7S"] },
      { cardIds: ["9S", "9H", "9D"] },
      { cardIds: ["10S", "10H", "10D", "10C"] },
    ], 13);
    expect(valid.valid).toBe(false);
    expect(valid.pureSequences).toBe(1);
    expect(valid.sequences).toBe(1);
  });

  it("marks an invalid declaration and applies the capped penalty", () => {
    const engine = new RummyEngine({ randomIndex: () => 0 });
    const state = engine.createInitialState(["alice", "bob"]);
    engine.applyCommand(state, command("alice", "start"));
    state.playersInternal[0]!.hand = cards([
      "3C", "4C", "5C", "7D", "8D", "9D", "10S", "10H", "10D", "2C", "2D", "2H", "6S",
    ]);
    const result = engine.applyCommand(state, command("alice", "declare", {
      groups: [{ cardIds: ["3C", "4C", "5C"] }],
    }));
    expect(result.publicState.phase).toBe("COMPLETE");
    expect(result.publicState.players.find((player) => player.id === "alice")?.invalidDeclaration).toBe(true);
    expect(result.publicState.players.find((player) => player.id === "alice")?.score).toBe(80);
  });
});

function command(actorId: string, type: string, payload: unknown = null) {
  return { actorId, type, requestId: `${actorId}-${type}`, payload };
}

function cards(values: string[]) {
  return values.map((value) => ({
    id: value,
    rank: value.startsWith("A") ? 1 : Number(value.slice(0, -1)),
    suit: value.slice(-1) as RummyCard["suit"],
  } as RummyCard));
}
