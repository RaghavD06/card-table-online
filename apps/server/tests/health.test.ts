import { describe, expect, it } from "vitest";
import { createServer } from "node:http";
import { createApp } from "../src/index";

describe("server foundation", () => {
  it("exposes liveness and baseline security headers", async () => {
    const server = createServer(createApp());
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("test server did not start");
    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/health/live`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ status: "ok" });
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(response.headers.get("x-frame-options")).toBe("DENY");
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
});
