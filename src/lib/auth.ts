import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { randomBytes, createHash } from "crypto";
import argon2 from "argon2";
import { supabaseAdmin } from "./supabase";

export type AuthedUser = { id: string; username: string };

const COOKIE_NAME = "fun_map_session";
export const SESSION_IDLE_MS = 1000 * 60 * 60 * 24 * 3;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function getSessionExpiryDate(now = new Date()) {
  return new Date(now.getTime() + SESSION_IDLE_MS);
}

export async function hashPassword(password: string) {
  return argon2.hash(password, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, password: string) {
  return argon2.verify(hash, password);
}

export async function createSession(userId: string, response: NextResponse) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = getSessionExpiryDate();
  const { error } = await supabaseAdmin().from("sessions").insert({
    user_id: userId,
    token_hash: hashToken(token),
    expires_at: expiresAt.toISOString(),
  });
  if (error) throw error;
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(response: NextResponse) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (token) {
    await supabaseAdmin().from("sessions").delete().eq("token_hash", hashToken(token));
  }
  response.cookies.set(COOKIE_NAME, "", { path: "/", maxAge: 0 });
}

export async function getCurrentUser(): Promise<AuthedUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const { data, error } = await supabaseAdmin()
    .from("sessions")
    .select("expires_at, users(id, username)")
    .eq("token_hash", hashToken(token))
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error || !data || !data.users) return null;
  const joinedUser = Array.isArray(data.users) ? data.users[0] : data.users;
  return { id: joinedUser.id, username: joinedUser.username };
}

export async function refreshCurrentSession(response: NextResponse): Promise<AuthedUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const tokenHash = hashToken(token);
  const now = new Date();
  const { data, error } = await supabaseAdmin()
    .from("sessions")
    .select("expires_at, users(id, username)")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (error || !data || !data.users) return null;
  if (new Date(data.expires_at) <= now) {
    await supabaseAdmin().from("sessions").delete().eq("token_hash", tokenHash);
    response.cookies.set(COOKIE_NAME, "", { path: "/", maxAge: 0 });
    return null;
  }
  const expiresAt = getSessionExpiryDate(now);
  await supabaseAdmin().from("sessions").update({ expires_at: expiresAt.toISOString() }).eq("token_hash", tokenHash);
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
  const joinedUser = Array.isArray(data.users) ? data.users[0] : data.users;
  return { id: joinedUser.id, username: joinedUser.username };
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  return user;
}
