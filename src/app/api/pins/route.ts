import { fail, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { config } from "@/lib/config";
import { distanceMeters } from "@/lib/geo";
import { supabaseAdmin } from "@/lib/supabase";
import { getKolkataWeekStart } from "@/lib/time";
import { pinSchema } from "@/lib/validation";

export const runtime = "nodejs";

type VisiblePinRow = {
  id: string;
  creator_id: string;
  latitude: number;
  longitude: number;
  place_label: string | null;
  pin_type: "verified" | "forgotten";
  created_at: string;
};

type UserRow = {
  id: string;
  username: string;
};

type PhotoRow = {
  pin_id: string;
  storage_path: string;
};

type ParticipantRow = {
  pin_id: string;
  user_id: string;
};

function decodeDataUrl(dataUrl: string) {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl);
  if (!match) throw new Error("Invalid image data");
  return { mimeType: match[1], buffer: Buffer.from(match[2], "base64") };
}

export async function GET() {
  try {
    const user = await requireUser();
    const supabase = supabaseAdmin();

    const { data: friendships, error: friendshipError } = await supabase
      .from("friendships")
      .select("friend_id")
      .eq("user_id", user.id);
    if (friendshipError) throw friendshipError;

    const visibleCreatorIds = [user.id, ...((friendships ?? []) as { friend_id: string }[]).map((friend) => friend.friend_id)];
    const { data, error } = await supabase
      .from("drink_pins")
      .select("id, creator_id, latitude, longitude, place_label, pin_type, created_at")
      .in("creator_id", visibleCreatorIds)
      .order("created_at", { ascending: false });
    if (error) throw error;

    const rows = (data ?? []) as unknown as VisiblePinRow[];
    const pinIds = rows.map((row) => row.id);
    const creatorIds = Array.from(new Set(rows.map((row) => row.creator_id)));
    const [{ data: creators, error: creatorError }, { data: photos, error: photoError }, { data: participantRows, error: participantError }] = await Promise.all([
      creatorIds.length
        ? supabase.from("users").select("id, username").in("id", creatorIds)
        : Promise.resolve({ data: [], error: null }),
      pinIds.length
        ? supabase.from("pin_photos").select("pin_id, storage_path").in("pin_id", pinIds)
        : Promise.resolve({ data: [], error: null }),
      pinIds.length
        ? supabase.from("drink_pin_participants").select("pin_id, user_id").in("pin_id", pinIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (creatorError) throw creatorError;
    if (photoError) throw photoError;
    if (participantError) throw participantError;

    const creatorById = new Map(((creators ?? []) as unknown as UserRow[]).map((creator) => [creator.id, creator.username]));
    const photoByPinId = new Map(((photos ?? []) as unknown as PhotoRow[]).map((photo) => [photo.pin_id, photo.storage_path]));
    const participantsByPinId = new Map<string, string[]>();
    for (const participant of (participantRows ?? []) as unknown as ParticipantRow[]) {
      participantsByPinId.set(participant.pin_id, [...(participantsByPinId.get(participant.pin_id) ?? []), participant.user_id]);
    }
    const participantUserIds = Array.from(new Set(Array.from(participantsByPinId.values()).flat()));
    const { data: participantUsers, error: participantUserError } = participantUserIds.length
      ? await supabase.from("users").select("id, username").in("id", participantUserIds)
      : { data: [], error: null };
    if (participantUserError) throw participantUserError;
    const participantById = new Map(((participantUsers ?? []) as unknown as UserRow[]).map((participant) => [participant.id, participant.username]));

    const pins = await Promise.all(rows.map(async (row) => {
      let photoUrl = null;
      const photoPath = photoByPinId.get(row.id);
      if (photoPath) {
        const signed = await supabase.storage.from(config.pinPhotoBucket).createSignedUrl(photoPath, 60 * 10);
        photoUrl = signed.data?.signedUrl ?? null;
      }
      return {
        id: row.id,
        creatorId: row.creator_id,
        creatorUsername: creatorById.get(row.creator_id) ?? "unknown",
        latitude: row.latitude,
        longitude: row.longitude,
        placeLabel: row.place_label,
        pinType: row.pin_type,
        createdAt: row.created_at,
        participants: (participantsByPinId.get(row.id) ?? [])
          .filter((participantId) => participantId !== row.creator_id)
          .map((participantId) => ({ id: participantId, username: participantById.get(participantId) ?? "unknown" })),
        photoUrl,
      };
    }));
    return ok({ pins });
  } catch (error) {
    return fail(error, error instanceof Error && error.message === "Unauthorized" ? 401 : 400);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const input = pinSchema.parse(await request.json());
    if (input.pinType === "verified") {
      if (input.currentLatitude === undefined || input.currentLongitude === undefined) {
        throw new Error("Current GPS location is required for verified pins");
      }
      const distance = distanceMeters(
        { latitude: input.latitude, longitude: input.longitude },
        { latitude: input.currentLatitude, longitude: input.currentLongitude },
      );
      if (distance > 150) throw new Error("Verified pins must be within 150m of your current location");
    }

    const supabase = supabaseAdmin();
    if (input.pinType === "forgotten") {
      const { count, error } = await supabase
        .from("drink_pins")
        .select("id", { count: "exact", head: true })
        .eq("creator_id", user.id)
        .eq("pin_type", "forgotten")
        .gte("created_at", getKolkataWeekStart());
      if (error) throw error;
      if ((count ?? 0) >= 2) throw new Error("Weekly forgotten-pin limit reached. Extra pins will be Rs 10 each soon.");
    }

    if (input.participantIds.length) {
      const { count, error } = await supabase
        .from("friendships")
        .select("friend_id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .in("friend_id", input.participantIds);
      if (error) throw error;
      if ((count ?? 0) !== input.participantIds.length) throw new Error("Only accepted friends can be tagged");
    }

    const { data: pin, error: pinError } = await supabase
      .from("drink_pins")
      .insert({
        creator_id: user.id,
        latitude: input.latitude,
        longitude: input.longitude,
        place_label: input.placeLabel,
        pin_type: input.pinType,
      })
      .select("id")
      .single();
    if (pinError) throw pinError;

    const participants = Array.from(new Set([user.id, ...input.participantIds])).map((participantId) => ({
      pin_id: pin.id,
      user_id: participantId,
    }));
    const { error: participantsError } = await supabase.from("drink_pin_participants").insert(participants);
    if (participantsError) throw participantsError;

    if (input.photoDataUrl) {
      const { buffer, mimeType } = decodeDataUrl(input.photoDataUrl);
      const ext = mimeType.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
      const path = `${user.id}/${pin.id}.${ext}`;
      const upload = await supabase.storage.from(config.pinPhotoBucket).upload(path, buffer, {
        contentType: mimeType,
        upsert: true,
      });
      if (upload.error) throw upload.error;
      const { error } = await supabase.from("pin_photos").insert({
        pin_id: pin.id,
        storage_path: path,
        mime_type: mimeType,
        uploaded_by: user.id,
      });
      if (error) throw error;
    }

    return ok({ id: pin.id });
  } catch (error) {
    return fail(error, error instanceof Error && error.message === "Unauthorized" ? 401 : 400);
  }
}
