import { getCurrentUser } from "@/lib/auth";
import { ok } from "@/lib/api";

export const runtime = "nodejs";

export async function GET() {
  return ok({ user: await getCurrentUser() });
}
