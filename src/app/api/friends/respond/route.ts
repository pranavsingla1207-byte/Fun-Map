import { fail, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { friendResponseSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const input = friendResponseSchema.parse(await request.json());
    const supabase = supabaseAdmin();
    const { data: friendRequest, error: requestError } = await supabase
      .from("friend_requests")
      .select("id, requester_id, recipient_id, status")
      .eq("id", input.requestId)
      .eq("recipient_id", user.id)
      .eq("status", "pending")
      .maybeSingle();
    if (requestError) throw requestError;
    if (!friendRequest) throw new Error("Friend request not found");
    const nextStatus = input.action === "accept" ? "accepted" : "rejected";
    const { error: updateError } = await supabase.from("friend_requests").update({ status: nextStatus }).eq("id", input.requestId);
    if (updateError) throw updateError;
    if (input.action === "accept") {
      const { error } = await supabase.from("friendships").upsert([
        { user_id: friendRequest.requester_id, friend_id: friendRequest.recipient_id },
        { user_id: friendRequest.recipient_id, friend_id: friendRequest.requester_id },
      ]);
      if (error) throw error;
    }
    return ok({ ok: true });
  } catch (error) {
    return fail(error, error instanceof Error && error.message === "Unauthorized" ? 401 : 400);
  }
}
