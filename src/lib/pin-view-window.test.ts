import { describe, expect, it } from "vitest";
import { isWithinPinViewWindow } from "./pin-view-window";

describe("isWithinPinViewWindow", () => {
  it("allows pins created within 24 hours", () => {
    expect(isWithinPinViewWindow("2026-06-15T06:00:00.000Z", new Date("2026-06-16T05:59:59.000Z"))).toBe(true);
  });

  it("expires pins older than 24 hours", () => {
    expect(isWithinPinViewWindow("2026-06-15T06:00:00.000Z", new Date("2026-06-16T06:00:01.000Z"))).toBe(false);
  });

  it("rejects invalid dates", () => {
    expect(isWithinPinViewWindow("not-a-date")).toBe(false);
  });
});
