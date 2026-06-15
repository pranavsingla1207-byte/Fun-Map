import { describe, expect, it } from "vitest";
import { getSessionExpiryDate, SESSION_IDLE_MS } from "./auth";

describe("session expiry", () => {
  it("sets a sliding expiry three days from activity", () => {
    const now = new Date("2026-06-15T00:00:00.000Z");
    expect(getSessionExpiryDate(now).getTime() - now.getTime()).toBe(SESSION_IDLE_MS);
    expect(getSessionExpiryDate(now).toISOString()).toBe("2026-06-18T00:00:00.000Z");
  });
});
