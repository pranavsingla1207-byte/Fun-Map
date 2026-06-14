import { fail, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { config } from "@/lib/config";
import { decodeImageDataUrl } from "@/lib/images";
import { supabaseAdmin } from "@/lib/supabase";
import { profilePhotoSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const input = profilePhotoSchema.parse(await request.json());
    const { buffer, mimeType } = decodeImageDataUrl(input.photoDataUrl);
    const ext = mimeType.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
    const path = `${user.id}/profile.${ext}`;
    const supabase = supabaseAdmin();
    const upload = await supabase.storage.from(config.profilePhotoBucket).upload(path, buffer, {
      contentType: mimeType,
      upsert: true,
    });
    if (upload.error) throw upload.error;
    const { error } = await supabase
      .from("users")
      .update({ profile_photo_path: path, profile_photo_mime_type: mimeType })
      .eq("id", user.id);
    if (error) throw error;
    const signed = await supabase.storage.from(config.profilePhotoBucket).createSignedUrl(path, 60 * 10);
    return ok({ profilePhotoUrl: signed.data?.signedUrl ?? null });
  } catch (error) {
    return fail(error, error instanceof Error && error.message === "Unauthorized" ? 401 : 400);
  }
}
