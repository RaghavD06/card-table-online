import { describe, expect, it } from "vitest";
import type { GameEngine } from "./index";

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
