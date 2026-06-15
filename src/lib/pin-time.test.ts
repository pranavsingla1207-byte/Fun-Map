import { describe, expect, it } from "vitest";
import { formatVerifiedPinTimeLog } from "./pin-time";

describe("formatVerifiedPinTimeLog", () => {
  it("formats pin creation time in Asia/Kolkata", () => {
    expect(formatVerifiedPinTimeLog("2026-06-15T11:30:00.000Z")).toBe("Logged at 5:00 PM, 15 Jun");
  });

  it("returns null for invalid dates", () => {
    expect(formatVerifiedPinTimeLog("not-a-date")).toBeNull();
  });
});
