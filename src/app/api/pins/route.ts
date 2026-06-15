import { fail, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { config } from "@/lib/config";
import { consumeForgottenCredit, getForgottenCreditBalance } from "@/lib/credits";
import { isMissingTableError } from "@/lib/db-errors";
import { distanceMeters } from "@/lib/geo";
import { decodeImageDataUrl } from "@/lib/images";
import { supabaseAdmin } from "@/lib/supabase";
import { pinSchema } from "@/lib/validation";

export const runtime = "nodejs";

type VisiblePinRow = {
  id: string;
  creator_id: string;
  latitude: number;
  longitude: number;
  place_label: string | null;
  pin_type: "verified" | "forgotten";
  activity_type: "hangout" | "party" | "random_drive" | "bunking" | "other";
  activity_other_label: string | null;
  created_at: string;
};

type UserRow = {
  id: string;
  username: string;
  profile_photo_path: string | null;
};

type PhotoRow = {
  pin_id: string;
  storage_path: string;
};

type ParticipantRow = {
  pin_id: string;
  user_id: string;
};

type TagRequestRow = {
  pin_id: string;
  recipient_id: string;
  status: "pending" | "accepted" | "rejected";
};

export async function GET() {
  try {
    const user = await requireUser();
    const supabase = supabaseAdmin();

    const [
      { data: outgoingFriendships, error: outgoingFriendshipError },
      { data: incomingFriendships, error: incomingFriendshipError },
      { data: acceptedRequests, error: acceptedRequestError },
      { data: participantPins, error: participantPinsError },
      { data: ownTagRequests, error: ownTagRequestsError },
    ] = await Promise.all([
      supabase.from("friendships").select("friend_id").eq("user_id", user.id),
      supabase.from("friendships").select("user_id").eq("friend_id", user.id),
      supabase.from("friend_requests").select("requester_id, recipient_id").eq("status", "accepted").or(`requester_id.eq.${user.id},recipient_id.eq.${user.id}`),
      supabase.from("drink_pin_participants").select("pin_id").eq("user_id", user.id),
      supabase.from("drink_pin_tag_requests").select("pin_id, status").eq("recipient_id", user.id).in("status", ["pending", "rejected"]),
    ]);
    if (outgoingFriendshipError) throw outgoingFriendshipError;
    if (incomingFriendshipError) throw incomingFriendshipError;
    if (acceptedRequestError) throw acceptedRequestError;
    if (participantPinsError) throw participantPinsError;
    if (ownTagRequestsError && !isMissingTableError(ownTagRequestsError)) throw ownTagRequestsError;

    const friendIds = new Set<string>([user.id]);
    for (const row of (outgoingFriendships ?? []) as { friend_id: string }[]) friendIds.add(row.friend_id);
    for (const row of (incomingFriendships ?? []) as { user_id: string }[]) friendIds.add(row.user_id);
    for (const row of (acceptedRequests ?? []) as { requester_id: string; recipient_id: string }[]) {
      friendIds.add(row.requester_id === user.id ? row.recipient_id : row.requester_id);
    }
    const participantPinIds = ((participantPins ?? []) as { pin_id: string }[]).map((row) => row.pin_id);
    const participantPinIdSet = new Set(participantPinIds);
    const hiddenTagPinIds = ownTagRequestsError ? new Set<string>() : new Set(((ownTagRequests ?? []) as { pin_id: string; status: string }[]).map((row) => row.pin_id));

    const { data, error } = await supabase
      .from("drink_pins")
      .select("id, creator_id, latitude, longitude, place_label, pin_type, activity_type, activity_other_label, created_at")
      .or(`creator_id.in.(${Array.from(friendIds).join(",")})${participantPinIds.length ? `,id.in.(${participantPinIds.join(",")})` : ""}`)
      .order("created_at", { ascending: false });
    if (error) throw error;

    const rows = ((data ?? []) as unknown as VisiblePinRow[]).filter((row) => {
      if (row.creator_id === user.id) return true;
      if (participantPinIdSet.has(row.id)) return true;
      return !hiddenTagPinIds.has(row.id);
    });
    const pinIds = rows.map((row) => row.id);
    const creatorIds = Array.from(new Set(rows.map((row) => row.creator_id)));
    const [{ data: creators, error: creatorError }, { data: photos, error: photoError }, { data: participantRows, error: participantError }, { data: tagRequestRows, error: tagRequestError }] = await Promise.all([
      creatorIds.length
        ? supabase.from("users").select("id, username, profile_photo_path").in("id", creatorIds)
        : Promise.resolve({ data: [], error: null }),
      pinIds.length
        ? supabase.from("pin_photos").select("pin_id, storage_path").in("pin_id", pinIds)
        : Promise.resolve({ data: [], error: null }),
      pinIds.length
        ? supabase.from("drink_pin_participants").select("pin_id, user_id").in("pin_id", pinIds)
        : Promise.resolve({ data: [], error: null }),
      pinIds.length
        ? supabase.from("drink_pin_tag_requests").select("pin_id, recipient_id, status").in("pin_id", pinIds).eq("requester_id", user.id).eq("status", "pending")
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (creatorError) throw creatorError;
    if (photoError) throw photoError;
    if (participantError) throw participantError;
    if (tagRequestError && !isMissingTableError(tagRequestError)) throw tagRequestError;

    const creatorById = new Map(((creators ?? []) as unknown as UserRow[]).map((creator) => [creator.id, creator]));
    const photoByPinId = new Map(((photos ?? []) as unknown as PhotoRow[]).map((photo) => [photo.pin_id, photo.storage_path]));
    const participantsByPinId = new Map<string, string[]>();
    for (const participant of (participantRows ?? []) as unknown as ParticipantRow[]) {
      participantsByPinId.set(participant.pin_id, [...(participantsByPinId.get(participant.pin_id) ?? []), participant.user_id]);
    }
    const pendingByPinId = new Map<string, string[]>();
    for (const tagRequest of (tagRequestError ? [] : (tagRequestRows ?? [])) as unknown as TagRequestRow[]) {
      pendingByPinId.set(tagRequest.pin_id, [...(pendingByPinId.get(tagRequest.pin_id) ?? []), tagRequest.recipient_id]);
    }
    const participantUserIds = Array.from(new Set([...Array.from(participantsByPinId.values()).flat(), ...Array.from(pendingByPinId.values()).flat()]));
    const { data: participantUsers, error: participantUserError } = participantUserIds.length
      ? await supabase.from("users").select("id, username, profile_photo_path").in("id", participantUserIds)
      : { data: [], error: null };
    if (participantUserError) throw participantUserError;
    const participantById = new Map(((participantUsers ?? []) as unknown as UserRow[]).map((participant) => [participant.id, participant]));

    const pins = await Promise.all(rows.map(async (row) => {
      let photoUrl = null;
      let creatorProfilePhotoUrl = null;
      const photoPath = photoByPinId.get(row.id);
      if (photoPath) {
        const signed = await supabase.storage.from(config.pinPhotoBucket).createSignedUrl(photoPath, 60 * 10);
        photoUrl = signed.data?.signedUrl ?? null;
      }
      const creator = creatorById.get(row.creator_id);
      if (creator?.profile_photo_path) {
        const signed = await supabase.storage.from(config.profilePhotoBucket).createSignedUrl(creator.profile_photo_path, 60 * 10);
        creatorProfilePhotoUrl = signed.data?.signedUrl ?? null;
      }
      const participants = await Promise.all((participantsByPinId.get(row.id) ?? [])
        .filter((participantId) => participantId !== row.creator_id)
        .map(async (participantId) => {
          const participant = participantById.get(participantId);
          let profilePhotoUrl = null;
          if (participant?.profile_photo_path) {
            const signed = await supabase.storage.from(config.profilePhotoBucket).createSignedUrl(participant.profile_photo_path, 60 * 10);
            profilePhotoUrl = signed.data?.signedUrl ?? null;
          }
          return { id: participantId, username: participant?.username ?? "unknown", profilePhotoUrl };
        }));
      return {
        id: row.id,
        creatorId: row.creator_id,
        creatorUsername: creator?.username ?? "unknown",
        creatorProfilePhotoUrl,
        latitude: row.latitude,
        longitude: row.longitude,
        placeLabel: row.place_label,
        pinType: row.pin_type,
        activityType: row.activity_type,
        activityOtherLabel: row.activity_other_label,
        createdAt: row.created_at,
        participants,
        pendingParticipants: (pendingByPinId.get(row.id) ?? []).map((participantId) => {
          const participant = participantById.get(participantId);
          return { id: participantId, username: participant?.username ?? "unknown" };
        }),
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
      const balance = await getForgottenCreditBalance(user.id);
      if (balance.remaining <= 0) {
        throw new Error("No forgotten pins left. Buy 10 more for Rs 10 to continue.");
      }
    }

    if (input.participantIds.length) {
      const { count, error } = await supabase
        .from("friendships")
        .select("friend_id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .in("friend_id", input.participantIds);
      if (error) throw error;
      if ((count ?? 0) !== input.participantIds.length) throw new Error("Only accepted friends can be tagged");

      const { error: tagTableError } = await supabase.from("drink_pin_tag_requests").select("id", { head: true }).limit(1);
      if (tagTableError) {
        if (isMissingTableError(tagTableError)) throw new Error("Pin approvals need a database update before tagging friends.");
        throw tagTableError;
      }
    }

    const { data: pin, error: pinError } = await supabase
      .from("drink_pins")
      .insert({
        creator_id: user.id,
        latitude: input.latitude,
        longitude: input.longitude,
        place_label: input.placeLabel,
        pin_type: input.pinType,
        activity_type: input.activityType,
        activity_other_label: input.activityType === "other" ? input.activityOtherLabel : null,
      })
      .select("id")
      .single();
    if (pinError) throw pinError;

    const { error: participantsError } = await supabase.from("drink_pin_participants").insert({
      pin_id: pin.id,
      user_id: user.id,
    });
    if (participantsError) throw participantsError;

    const tagRequests = Array.from(new Set(input.participantIds.filter((participantId) => participantId !== user.id))).map((participantId) => ({
      pin_id: pin.id,
      requester_id: user.id,
      recipient_id: participantId,
    }));
    if (tagRequests.length) {
      const { error: tagRequestsError } = await supabase.from("drink_pin_tag_requests").insert(tagRequests);
      if (tagRequestsError) throw tagRequestsError;
    }

    if (input.pinType === "forgotten") {
      await consumeForgottenCredit(user.id, pin.id);
    }

    if (input.photoDataUrl) {
      const { buffer, mimeType } = decodeImageDataUrl(input.photoDataUrl);
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
