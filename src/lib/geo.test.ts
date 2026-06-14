import { describe, expect, it } from "vitest";
import { distanceMeters } from "./geo";

describe("distanceMeters", () => {
  it("returns a small distance for nearby points", () => {
    const distance = distanceMeters(
      { latitude: 28.6139, longitude: 77.209 },
      { latitude: 28.614, longitude: 77.2091 },
    );
    expect(distance).toBeLessThan(20);
  });

  it("returns a large distance for faraway points", () => {
    const distance = distanceMeters(
      { latitude: 28.6139, longitude: 77.209 },
      { latitude: 19.076, longitude: 72.8777 },
    );
    expect(distance).toBeGreaterThan(1_000_000);
  });
});
