import { NextResponse } from "next/server";
import { createSession, verifyPassword } from "@/lib/auth";
import { fail } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase";
import { authSchema, normalizeUsername } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const input = authSchema.parse(await request.json());
    const username = normalizeUsername(input.username);
    const { data, error } = await supabaseAdmin()
      .from("users")
      .select("id, username, password_hash")
      .eq("username", username)
      .maybeSingle();
    if (error) throw error;
    if (!data || !(await verifyPassword(data.password_hash, input.password))) {
      throw new Error("Invalid username or password");
    }
    const response = NextResponse.json({ user: { id: data.id, username: data.username } });
    await createSession(data.id, response);
    return response;
  } catch (error) {
    return fail(error);
  }
}
