import { fail, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getForgottenCreditBalance } from "@/lib/credits";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    return ok(await getForgottenCreditBalance(user.id));
  } catch (error) {
    return fail(error, error instanceof Error && error.message === "Unauthorized" ? 401 : 400);
  }
}
