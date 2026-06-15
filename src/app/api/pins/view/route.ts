import { fail, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { isMissingTableError } from "@/lib/db-errors";
import { isWithinPinViewWindow } from "@/lib/pin-view-window";
import { supabaseAdmin } from "@/lib/supabase";
import { pinViewSchema } from "@/lib/validation";

export const runtime = "nodejs";

type PinRow = {
  id: string;
  creator_id: string;
  created_at: string;
};

type ViewRow = {
  viewer_id: string;
  created_at: string;
};

type UserRow = {
  id: string;
  username: string;
};

async function getPinOrThrow(pinId: string) {
  const { data, error } = await supabaseAdmin()
    .from("drink_pins")
    .select("id, creator_id, created_at")
    .eq("id", pinId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Pin not found");
  return data as PinRow;
}

async function isApprovedParticipant(pinId: string, userId: string) {
  const { data, error } = await supabaseAdmin()
    .from("drink_pin_participants")
    .select("pin_id")
    .eq("pin_id", pinId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const input = pinViewSchema.parse(await request.json());
    const pin = await getPinOrThrow(input.pinId);

    if (!isWithinPinViewWindow(pin.created_at)) return ok({ recorded: false });
    if (pin.creator_id === user.id) return ok({ recorded: false });
    if (await isApprovedParticipant(pin.id, user.id)) return ok({ recorded: false });

    const { data: friendship, error: friendshipError } = await supabaseAdmin()
      .from("friendships")
      .select("user_id")
      .eq("user_id", pin.creator_id)
      .eq("friend_id", user.id)
      .maybeSingle();
    if (friendshipError) throw friendshipError;
    if (!friendship) return ok({ recorded: false });

    const { error } = await supabaseAdmin().from("drink_pin_views").insert({
      pin_id: pin.id,
      viewer_id: user.id,
    });
    if (error) {
      if (isMissingTableError(error)) throw new Error("Pin viewers need a database update before tracking views.");
      throw error;
    }

    return ok({ recorded: true });
  } catch (error) {
    return fail(error, error instanceof Error && error.message === "Unauthorized" ? 401 : 400);
  }
}

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const pinId = new URL(request.url).searchParams.get("pinId");
    const input = pinViewSchema.parse({ pinId });
    const pin = await getPinOrThrow(input.pinId);

    const canView = pin.creator_id === user.id || await isApprovedParticipant(pin.id, user.id);
    if (!canView) throw new Error("You cannot view this pin's viewers");
    if (!isWithinPinViewWindow(pin.created_at)) return ok({ viewers: [], expired: true });

    const { data: views, error: viewsError } = await supabaseAdmin()
      .from("drink_pin_views")
      .select("viewer_id, created_at")
      .eq("pin_id", pin.id)
      .order("created_at", { ascending: false });
    if (viewsError) {
      if (isMissingTableError(viewsError)) throw new Error("Pin viewers need a database update before viewing viewers.");
      throw viewsError;
    }

    const viewerIds = Array.from(new Set(((views ?? []) as unknown as ViewRow[]).map((view) => view.viewer_id)));
    const { data: users, error: usersError } = viewerIds.length
      ? await supabaseAdmin().from("users").select("id, username").in("id", viewerIds)
      : { data: [], error: null };
    if (usersError) throw usersError;

    const userById = new Map(((users ?? []) as unknown as UserRow[]).map((viewer) => [viewer.id, viewer.username]));
    return ok({
      viewers: viewerIds.map((viewerId) => ({ id: viewerId, username: userById.get(viewerId) ?? "unknown" })),
      expired: false,
    });
  } catch (error) {
    return fail(error, error instanceof Error && error.message === "Unauthorized" ? 401 : 400);
  }
}
