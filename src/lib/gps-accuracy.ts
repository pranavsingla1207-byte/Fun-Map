export const GPS_VERIFIED_ACCURACY_LIMIT_METERS = 150;

export function isGpsAccuracyGoodEnough(accuracyMeters: number | null | undefined) {
  return typeof accuracyMeters === "number"
    && Number.isFinite(accuracyMeters)
    && accuracyMeters > 0
    && accuracyMeters <= GPS_VERIFIED_ACCURACY_LIMIT_METERS;
}

export function formatGpsAccuracy(accuracyMeters: number | null | undefined) {
  if (typeof accuracyMeters !== "number" || !Number.isFinite(accuracyMeters) || accuracyMeters <= 0) return "unknown";
  return accuracyMeters >= 1000 ? `${(accuracyMeters / 1000).toFixed(1)} km` : `${Math.round(accuracyMeters)} m`;
}
