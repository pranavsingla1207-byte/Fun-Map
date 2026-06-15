export const PIN_VIEW_WINDOW_MS = 1000 * 60 * 60 * 24;

export function isWithinPinViewWindow(createdAt: string, now = new Date()) {
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return false;
  const ageMs = now.getTime() - created.getTime();
  return ageMs >= 0 && ageMs <= PIN_VIEW_WINDOW_MS;
}
