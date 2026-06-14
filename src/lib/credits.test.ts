import { describe, expect, it } from "vitest";
import { getKolkataMonthKey } from "./time";

describe("getKolkataMonthKey", () => {
  it("formats the month in Asia/Kolkata", () => {
    expect(getKolkataMonthKey(new Date("2026-06-14T12:00:00Z"))).toBe("2026-06");
  });
});
