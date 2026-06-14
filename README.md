# Fun Map

Mobile-first web app for adding friends, dropping drinking pins, attaching optional photos, and keeping forgotten-location claims limited.

## Setup

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the Supabase SQL editor.
3. Create a private Supabase Storage bucket named `pin-photos`.
4. Copy `.env.example` to `.env.local` and fill in:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SESSION_SECRET`
   - `NEXT_PUBLIC_MAPTILER_API_KEY`
5. Run `npm run dev`.

## Features

- Unique username/password accounts with secure HTTP-only sessions.
- Friend requests and accepted friendships.
- GPS-verified pins limited to within 150m of the browser location.
- Forgotten pins limited to 2 per week in Asia/Kolkata time.
- Optional compressed pin photos stored in private Supabase Storage.
- Friend-only visibility for pins and signed photo URLs.

## Scripts

- `npm run dev`
- `npm run lint`
- `npm run test`
- `npm run build`
