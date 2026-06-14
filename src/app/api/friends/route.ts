import { fail, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { config } from "@/lib/config";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

type FriendshipRow = {
  users: { id: string; username: string; profile_photo_path: string | null };
};

type IncomingRequestRow = {
  id: string;
  created_at: string;
  users: { username: string };
};

export async function GET() {
  try {
    const user = await requireUser();
    const supabase = supabaseAdmin();
    const [{ data: rows, error }, { data: incoming, error: incomingError }] = await Promise.all([
      supabase
        .from("friendships")
        .select("friend_id, users!friendships_friend_id_fkey(id, username, profile_photo_path)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("friend_requests")
        .select("id, created_at, users!friend_requests_requester_id_fkey(username)")
        .eq("recipient_id", user.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false }),
    ]);
    if (error) throw error;
    if (incomingError) throw incomingError;
    const friendRows = (rows ?? []) as unknown as FriendshipRow[];
    const incomingRows = (incoming ?? []) as unknown as IncomingRequestRow[];
    return ok({
      friends: await Promise.all(friendRows.map(async (row) => {
        let profilePhotoUrl = null;
        if (row.users.profile_photo_path) {
          const signed = await supabase.storage.from(config.profilePhotoBucket).createSignedUrl(row.users.profile_photo_path, 60 * 10);
          profilePhotoUrl = signed.data?.signedUrl ?? null;
        }
        return { id: row.users.id, username: row.users.username, profilePhotoUrl };
      })),
      incomingRequests: incomingRows.map((row) => ({ id: row.id, username: row.users.username, createdAt: row.created_at })),
    });
  } catch (error) {
    return fail(error, error instanceof Error && error.message === "Unauthorized" ? 401 : 400);
  }
}
