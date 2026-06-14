import { fail, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { friendRequestSchema, normalizeUsername } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const input = friendRequestSchema.parse(await request.json());
    const username = normalizeUsername(input.username);
    const supabase = supabaseAdmin();
    const { data: recipient, error: findError } = await supabase.from("users").select("id").eq("username", username).maybeSingle();
    if (findError) throw findError;
    if (!recipient) throw new Error("No user found with that username");
    if (recipient.id === user.id) throw new Error("You cannot add yourself");
    const { data: existingFriend } = await supabase
      .from("friendships")
      .select("user_id")
      .eq("user_id", user.id)
      .eq("friend_id", recipient.id)
      .maybeSingle();
    if (existingFriend) throw new Error("You are already friends");
    const { error } = await supabase.from("friend_requests").upsert(
      { requester_id: user.id, recipient_id: recipient.id, status: "pending" },
      { onConflict: "requester_id,recipient_id" },
    );
    if (error) throw error;
    return ok({ ok: true });
  } catch (error) {
    return fail(error, error instanceof Error && error.message === "Unauthorized" ? 401 : 400);
  }
}
