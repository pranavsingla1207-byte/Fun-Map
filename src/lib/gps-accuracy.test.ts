import { describe, expect, it } from "vitest";
import { formatGpsAccuracy, isGpsAccuracyGoodEnough } from "./gps-accuracy";

describe("gps accuracy", () => {
  it("accepts accuracy at or below the verified limit", () => {
    expect(isGpsAccuracyGoodEnough(150)).toBe(true);
  });

  it("rejects missing or broad accuracy", () => {
    expect(isGpsAccuracyGoodEnough(null)).toBe(false);
    expect(isGpsAccuracyGoodEnough(151)).toBe(false);
    expect(isGpsAccuracyGoodEnough(1800)).toBe(false);
  });

  it("formats meters and kilometers", () => {
    expect(formatGpsAccuracy(42.4)).toBe("42 m");
    expect(formatGpsAccuracy(1800)).toBe("1.8 km");
    expect(formatGpsAccuracy(undefined)).toBe("unknown");
  });
});
