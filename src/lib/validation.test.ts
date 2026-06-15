import { describe, expect, it } from "vitest";
import { addPinTagsSchema, authSchema, normalizeUsername, pinSchema, pinTagResponseSchema, pinViewSchema, removePinSchema } from "./validation";

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

  it("accepts pin tag approval responses", () => {
    const response = pinTagResponseSchema.parse({ requestId: "11111111-1111-4111-8111-111111111111", action: "accept" });
    expect(response.action).toBe("accept");
  });

  it("accepts remove pin payloads", () => {
    const payload = removePinSchema.parse({ pinId: "11111111-1111-4111-8111-111111111111" });
    expect(payload.pinId).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("accepts post-publish pin tag payloads", () => {
    const payload = addPinTagsSchema.parse({
      pinId: "11111111-1111-4111-8111-111111111111",
      participantIds: ["22222222-2222-4222-8222-222222222222"],
    });
    expect(payload.participantIds).toHaveLength(1);
  });

  it("accepts pin view payloads", () => {
    const payload = pinViewSchema.parse({ pinId: "11111111-1111-4111-8111-111111111111" });
    expect(payload.pinId).toBe("11111111-1111-4111-8111-111111111111");
  });
});
