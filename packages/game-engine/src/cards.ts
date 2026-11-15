export type Suit = "C" | "D" | "H" | "S";
export type Rank = "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "T" | "J" | "Q" | "K";
export type Card = `${Rank}${Suit}`;

export const SUITS: readonly Suit[] = ["C", "D", "H", "S"];
export const RANKS: readonly Rank[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K"];

export function createDeck(): Card[] {
  return SUITS.flatMap((suit) => RANKS.map((rank) => `${rank}${suit}` as Card));
}

export function isCard(value: unknown): value is Card {
  return typeof value === "string" && /^(A|[2-9]|T|J|Q|K)[CDHS]$/.test(value);
}

export function rankValue(card: Card): number {
  const rank = card.slice(0, -1) as Rank;
  return rank === "A" ? 14 : RANKS.indexOf(rank) + 1;
}

export function cardRank(card: Card): Rank {
  return card.slice(0, -1) as Rank;
}

export function cardSuit(card: Card): Suit {
  return card.slice(-1) as Suit;
}

export function isStrictlyBetween(card: Card, first: Card, second: Card): boolean {
  const value = rankValue(card);
  const low = Math.min(rankValue(first), rankValue(second));
  const high = Math.max(rankValue(first), rankValue(second));
  return value > low && value < high;
}
