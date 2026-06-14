import { z } from "zod";

export function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

export const authSchema = z.object({
  username: z.string().trim().min(3).max(24).regex(/^[a-zA-Z0-9_]+$/, "Use letters, numbers, and underscores only"),
  password: z.string().min(8).max(128),
});

export const friendRequestSchema = z.object({
  username: z.string().trim().min(3).max(24),
});

export const friendResponseSchema = z.object({
  requestId: z.string().uuid(),
  action: z.enum(["accept", "reject"]),
});

export const pinSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  currentLatitude: z.number().min(-90).max(90).optional(),
  currentLongitude: z.number().min(-180).max(180).optional(),
  placeLabel: z.string().trim().max(80).nullable().optional(),
  pinType: z.enum(["verified", "forgotten"]),
  participantIds: z.array(z.string().uuid()).max(20).default([]),
  photoDataUrl: z.string().startsWith("data:image/").max(1_400_000).nullable().optional(),
});
