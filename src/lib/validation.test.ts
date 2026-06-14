import { describe, expect, it } from "vitest";
import { authSchema, normalizeUsername, pinSchema } from "./validation";

describe("validation", () => {
  it("normalizes usernames case-insensitively", () => {
    expect(normalizeUsername("  Fun_User  ")).toBe("fun_user");
  });

  it("accepts forgotten pin payloads without current GPS coordinates", () => {
    const pin = pinSchema.parse({
      latitude: 12,
      longitude: 77,
      pinType: "forgotten",
      activityType: "party",
      participantIds: [],
    });
    expect(pin.pinType).toBe("forgotten");
    expect(pin.activityType).toBe("party");
  });

  it("rejects weak account payloads", () => {
    expect(() => authSchema.parse({ username: "ab", password: "short" })).toThrow();
  });
});
