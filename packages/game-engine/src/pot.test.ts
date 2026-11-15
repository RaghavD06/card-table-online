import { describe, expect, it } from "vitest";
import { PotDomainError, PotEngine, evaluatePotHand, type PotCard } from "./pot";

describe("In-Between pot engine", () => {
  it("uses strict-between evaluation, including equal and consecutive cards", () => {
    const cards = (lower: PotCard, upper: PotCard, revealed: PotCard) =>
      evaluatePotHand(lower, upper, revealed, "HIGH");
    expect(cards(card("5C", 5), card("10D", 10), card("7H", 7))).toBe("WIN");
    expect(cards(card("5C", 5), card("10D", 10), card("5H", 5))).toBe("LOSE");
    expect(cards(card("5C", 5), card("6D", 6), card("5H", 5))).toBe("LOSE");
  });

  it("settles a winning bet at 1:1, rotates turns, and rejects duplicate actions", () => {
    const engine = new PotEngine({ minBet: 10, maxBet: 100, startingBalance: 1_000, randomIndex: () => 0 });
    const state = engine.createInitialState(["alice", "bob"]);
    engine.applyCommand(state, command("alice", "start", "start-1"));
    state.lowerCard = card("5C", 5);
    state.upperCard = card("10D", 10);
    state.deck = [card("7H", 7)];

    const result = engine.applyCommand(state, command("alice", "bet", "bet-1", { amount: 10 }));
    expect(result.publicState.lastOutcome).toBe("WIN");
    expect(result.publicState.players.find((player) => player.id === "alice")?.balance).toBe(1_010);
    expect(result.publicState.currentPlayerId).toBe("bob");
    expect(() => engine.applyCommand(state, command("alice", "bet", "bet-1", { amount: 10 }))).toThrow(PotDomainError);
  });

  it("supports pass without changing balance and validates turn and bet limits", () => {
    const engine = new PotEngine({ minBet: 10, maxBet: 20, startingBalance: 100, randomIndex: () => 0 });
    const state = engine.createInitialState(["alice", "bob"]);
    engine.applyCommand(state, command("alice", "start", "start-1"));
    expect(() => engine.applyCommand(state, command("bob", "pass", "pass-wrong"))).toThrow(PotDomainError);
    expect(() => engine.applyCommand(state, command("alice", "bet", "bet-too-low", { amount: 5 }))).toThrow(PotDomainError);
    const result = engine.applyCommand(state, command("alice", "pass", "pass-1"));
    expect(result.publicState.lastOutcome).toBe("PASSED");
    expect(result.publicState.players.find((player) => player.id === "alice")?.balance).toBe(100);
    expect(result.publicState.currentPlayerId).toBe("bob");
  });

  it("supports configurable ace ranking", () => {
    expect(evaluatePotHand(card("AC", 1), card("5D", 5), card("3H", 3), "LOW")).toBe("WIN");
    expect(evaluatePotHand(card("AC", 1), card("5D", 5), card("3H", 3), "HIGH")).toBe("LOSE");
  });
});

function command(actorId: string, type: string, requestId: string, payload: unknown = null) {
  return { actorId, type, requestId, payload };
}

function card(id: string, rank: PotCard["rank"]): PotCard {
  return { id, rank, suit: id.slice(-1) as PotCard["suit"] };
}
