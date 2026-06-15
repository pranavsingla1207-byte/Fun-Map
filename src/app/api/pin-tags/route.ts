import { fail, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { config } from "@/lib/config";
import { isMissingTableError } from "@/lib/db-errors";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

type TagRequestRow = {
  id: string;
  created_at: string;
  drink_pins: {
    id: string;
    creator_id: string;
    place_label: string | null;
    pin_type: "verified" | "forgotten";
    activity_type: "hangout" | "party" | "random_drive" | "bunking" | "other";
    activity_other_label: string | null;
    created_at: string;
    users: { username: string } | { username: string }[];
    pin_photos: { storage_path: string } | { storage_path: string }[] | null;
  };
};

export async function GET() {
  try {
    const user = await requireUser();
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from("drink_pin_tag_requests")
      .select(`
        id,
        created_at,
        drink_pins!inner(
          id,
          creator_id,
          place_label,
          pin_type,
          activity_type,
          activity_other_label,
          created_at,
          users!drink_pins_creator_id_fkey(username),
          pin_photos(storage_path)
        )
      `)
      .eq("recipient_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    if (error && isMissingTableError(error)) return ok({ requests: [] });
    if (error) throw error;

    const requests = await Promise.all(((data ?? []) as unknown as TagRequestRow[]).map(async (request) => {
      const photos = Array.isArray(request.drink_pins.pin_photos) ? request.drink_pins.pin_photos : request.drink_pins.pin_photos ? [request.drink_pins.pin_photos] : [];
      const creator = Array.isArray(request.drink_pins.users) ? request.drink_pins.users[0] : request.drink_pins.users;
      const photoPath = photos[0]?.storage_path;
      let photoUrl = null;
      if (photoPath) {
        const signed = await supabase.storage.from(config.pinPhotoBucket).createSignedUrl(photoPath, 60 * 10);
        photoUrl = signed.data?.signedUrl ?? null;
      }
      return {
        id: request.id,
        pinId: request.drink_pins.id,
        creatorId: request.drink_pins.creator_id,
        creatorUsername: creator?.username ?? "unknown",
        placeLabel: request.drink_pins.place_label,
        pinType: request.drink_pins.pin_type,
        activityType: request.drink_pins.activity_type,
        activityOtherLabel: request.drink_pins.activity_other_label,
        pinCreatedAt: request.drink_pins.created_at,
        requestedAt: request.created_at,
        photoUrl,
      };
    }));

    return ok({ requests });
  } catch (error) {
    return fail(error, error instanceof Error && error.message === "Unauthorized" ? 401 : 400);
  }
}
