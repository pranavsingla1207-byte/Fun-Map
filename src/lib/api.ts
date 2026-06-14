import { NextResponse } from "next/server";

export function ok(data: unknown = {}) {
  return NextResponse.json(data);
}

export function fail(error: unknown, status = 400) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error && typeof error.message === "string"
        ? error.message
        : "Request failed";
  return NextResponse.json({ error: message }, { status });
}
