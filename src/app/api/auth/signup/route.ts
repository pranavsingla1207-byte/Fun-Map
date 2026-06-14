import { NextResponse } from "next/server";
import { createSession, hashPassword } from "@/lib/auth";
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
      .insert({ username, password_hash: await hashPassword(input.password) })
      .select("id, username")
      .single();
    if (error) {
      if (error.code === "23505") throw new Error("That username is already taken");
      throw error;
    }
    const response = NextResponse.json({ user: data });
    await createSession(data.id, response);
    return response;
  } catch (error) {
    return fail(error);
  }
}
