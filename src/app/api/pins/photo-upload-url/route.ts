import { fail, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { config } from "@/lib/config";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

export async function POST() {
  try {
    const user = await requireUser();
    const path = `${user.id}/pending-${crypto.randomUUID()}.jpg`;
    const { data, error } = await supabaseAdmin().storage.from(config.pinPhotoBucket).createSignedUploadUrl(path);
    if (error) throw error;
    return ok({ path, signedUrl: data.signedUrl, token: data.token });
  } catch (error) {
    return fail(error, error instanceof Error && error.message === "Unauthorized" ? 401 : 400);
  }
}
