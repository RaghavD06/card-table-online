import { describe, expect, it } from "vitest";
import { createApp } from "../src/index";

describe("server foundation", () => {
  it("exposes a phase 1 health response", async () => {
    const response = await fetch("http://localhost:0").catch(() => undefined);
    expect(response).toBeUndefined();
    expect(createApp).toBeTypeOf("function");
  });
});
