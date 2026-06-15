import { fail, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { pinTagResponseSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const input = pinTagResponseSchema.parse(await request.json());
    const supabase = supabaseAdmin();
    const { data: tagRequest, error: requestError } = await supabase
      .from("drink_pin_tag_requests")
      .select("id, pin_id, recipient_id, status")
      .eq("id", input.requestId)
      .eq("recipient_id", user.id)
      .eq("status", "pending")
      .maybeSingle();
    if (requestError) throw requestError;
    if (!tagRequest) throw new Error("Pin tag request not found");

    if (input.action === "accept") {
      const { error: participantError } = await supabase.from("drink_pin_participants").upsert({
        pin_id: tagRequest.pin_id,
        user_id: user.id,
      });
      if (participantError) throw participantError;
    }

    const { error: updateError } = await supabase
      .from("drink_pin_tag_requests")
      .update({ status: input.action === "accept" ? "accepted" : "rejected", updated_at: new Date().toISOString() })
      .eq("id", input.requestId)
      .eq("recipient_id", user.id);
    if (updateError) throw updateError;

    return ok({ ok: true });
  } catch (error) {
    return fail(error, error instanceof Error && error.message === "Unauthorized" ? 401 : 400);
  }
}
