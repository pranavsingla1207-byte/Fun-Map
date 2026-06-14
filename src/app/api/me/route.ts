import { getCurrentUser } from "@/lib/auth";
import { ok } from "@/lib/api";
import { config } from "@/lib/config";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return ok({ user: null });
  const supabase = supabaseAdmin();
  const { data } = await supabase.from("users").select("profile_photo_path").eq("id", user.id).maybeSingle();
  let profilePhotoUrl = null;
  if (data?.profile_photo_path) {
    const signed = await supabase.storage.from(config.profilePhotoBucket).createSignedUrl(data.profile_photo_path, 60 * 10);
    profilePhotoUrl = signed.data?.signedUrl ?? null;
  }
  return ok({ user: { ...user, profilePhotoUrl } });
}
