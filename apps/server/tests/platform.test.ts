import { describe, expect, it } from "vitest";
import { MemoryAuthBoundary, PlatformError, SocialService } from "../src/platform";

describe("social platform boundary", () => {
  it("supports guest and email sessions without exposing passwords", async () => {
    const auth = new MemoryAuthBoundary();
    const guest = await auth.createGuestSession("  Guest Player  ");
    const email = await auth.registerEmail("player@example.com", "correct horse battery", "Player");
    expect(guest.isGuest).toBe(true);
    expect(email.isGuest).toBe(false);
    expect(email.token).toBeTruthy();
    await expect(auth.loginEmail("player@example.com", "wrong password")).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    expect(auth.getUser(email.userId)).not.toHaveProperty("password");
  });

  it("authorizes friend requests and enforces wallet limits", async () => {
    const auth = new MemoryAuthBoundary();
    const first = await auth.createGuestSession("First");
    const second = await auth.createGuestSession("Second");
    const social = new SocialService(auth);
    const request = social.addFriend(first.userId, second.userId);
    expect(request.status).toBe("PENDING");
    expect(social.notifications(second.userId)).toHaveLength(1);
    social.respondFriend(second.userId, first.userId, "ACCEPTED");
    expect(social.friends(first.userId)[0]?.status).toBe("ACCEPTED");
    expect(() => social.adjustWallet(first.userId, -2_000, "bet")).toThrowError(PlatformError);
  });
});
