import { NextResponse } from "next/server";
import { refreshCurrentSession } from "@/lib/auth";
import { config } from "@/lib/config";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET() {
  const response = NextResponse.json({ user: null });
  const user = await refreshCurrentSession(response);
  if (!user) return response;
  const supabase = supabaseAdmin();
  const { data } = await supabase.from("users").select("profile_photo_path").eq("id", user.id).maybeSingle();
  let profilePhotoUrl = null;
  if (data?.profile_photo_path) {
    const signed = await supabase.storage.from(config.profilePhotoBucket).createSignedUrl(data.profile_photo_path, 60 * 10);
    profilePhotoUrl = signed.data?.signedUrl ?? null;
  }
  return NextResponse.json({ user: { ...user, profilePhotoUrl } }, { headers: response.headers });
}
