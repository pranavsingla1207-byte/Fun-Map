import { fail, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { getKolkataWeekStart } from "@/lib/time";

export const runtime = "nodejs";

type PlaceRow = {
  place_label: string | null;
  latitude: number;
  longitude: number;
};

type IdRow = {
  id: string;
};

export async function GET() {
  try {
    const user = await requireUser();
    const supabase = supabaseAdmin();
    const [{ count: totalPins, error: totalError }, { data: places, error: placesError }, { count: forgotten, error: forgottenError }, { data: ownPins, error: ownPinsError }] = await Promise.all([
      supabase.from("drink_pins").select("id", { count: "exact", head: true }).eq("creator_id", user.id),
      supabase.from("drink_pins").select("place_label, latitude, longitude").eq("creator_id", user.id),
      supabase.from("drink_pins").select("id", { count: "exact", head: true }).eq("creator_id", user.id).eq("pin_type", "forgotten").gte("created_at", getKolkataWeekStart()),
      supabase.from("drink_pins").select("id").eq("creator_id", user.id),
    ]);
    if (totalError) throw totalError;
    if (placesError) throw placesError;
    if (forgottenError) throw forgottenError;
    if (ownPinsError) throw ownPinsError;

    let friendTaggedPins = 0;
    const ownPinIds = ((ownPins ?? []) as unknown as IdRow[]).map((pin) => pin.id);
    if (ownPinIds.length) {
      const { count, error } = await supabase
        .from("drink_pin_participants")
        .select("pin_id", { count: "exact", head: true })
        .neq("user_id", user.id)
        .in("pin_id", ownPinIds);
      if (error) throw error;
      friendTaggedPins = count ?? 0;
    }

    const uniquePlaces = new Set(
      ((places ?? []) as unknown as PlaceRow[]).map((pin) => pin.place_label || `${Number(pin.latitude).toFixed(4)},${Number(pin.longitude).toFixed(4)}`),
    ).size;
    return ok({
      totalPins: totalPins ?? 0,
      uniquePlaces,
      friendTaggedPins,
      forgottenPinsUsedThisWeek: forgotten ?? 0,
    });
  } catch (error) {
    return fail(error, error instanceof Error && error.message === "Unauthorized" ? 401 : 400);
  }
}
