import { fail, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { isMissingTableError } from "@/lib/db-errors";
import { supabaseAdmin } from "@/lib/supabase";
import { addPinTagsSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const input = addPinTagsSchema.parse(await request.json());
    const participantIds = Array.from(new Set(input.participantIds)).filter((participantId) => participantId !== user.id);
    if (!participantIds.length) throw new Error("Choose at least one friend to tag");

    const supabase = supabaseAdmin();
    const { data: pin, error: pinError } = await supabase
      .from("drink_pins")
      .select("id, creator_id")
      .eq("id", input.pinId)
      .maybeSingle();
    if (pinError) throw pinError;
    if (!pin) throw new Error("Pin not found");
    if (pin.creator_id !== user.id) throw new Error("Only the pin creator can tag more friends");

    const { count: friendCount, error: friendError } = await supabase
      .from("friendships")
      .select("friend_id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .in("friend_id", participantIds);
    if (friendError) throw friendError;
    if ((friendCount ?? 0) !== participantIds.length) throw new Error("Only accepted friends can be tagged");

    const { data: existingParticipants, error: participantError } = await supabase
      .from("drink_pin_participants")
      .select("user_id")
      .eq("pin_id", input.pinId)
      .in("user_id", participantIds);
    if (participantError) throw participantError;
    if ((existingParticipants ?? []).length) throw new Error("Some selected friends are already on this pin");

    const { data: existingRequests, error: requestError } = await supabase
      .from("drink_pin_tag_requests")
      .select("recipient_id")
      .eq("pin_id", input.pinId)
      .in("recipient_id", participantIds);
    if (requestError) {
      if (isMissingTableError(requestError)) throw new Error("Pin approvals need a database update before tagging friends.");
      throw requestError;
    }
    if ((existingRequests ?? []).length) throw new Error("Some selected friends already have tag requests for this pin");

    const { error: insertError } = await supabase.from("drink_pin_tag_requests").insert(
      participantIds.map((participantId) => ({
        pin_id: input.pinId,
        requester_id: user.id,
        recipient_id: participantId,
      })),
    );
    if (insertError) throw insertError;

    return ok({ requested: participantIds.length });
  } catch (error) {
    return fail(error, error instanceof Error && error.message === "Unauthorized" ? 401 : 400);
  }
}
