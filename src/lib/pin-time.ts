export function formatVerifiedPinTimeLog(createdAt: string) {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    day: "numeric",
    month: "short",
  }).formatToParts(date);

  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const dayPeriod = value("dayPeriod").toUpperCase();
  return `Logged at ${value("hour")}:${value("minute")} ${dayPeriod}, ${value("day")} ${value("month")}`;
}
