export function isMissingTableError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const maybeError = error as { code?: string; message?: string };
  return maybeError.code === "42P01" || /does not exist/i.test(maybeError.message ?? "");
}
