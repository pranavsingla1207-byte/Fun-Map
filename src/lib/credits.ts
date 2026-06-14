import { supabaseAdmin } from "./supabase";
import { getKolkataMonthKey } from "./time";

export type CreditBalance = {
  freeGranted: number;
  paidGranted: number;
  consumed: number;
  remaining: number;
  periodMonth: string;
};

export async function ensureMonthlyFreeCredits(userId: string) {
  const supabase = supabaseAdmin();
  const periodMonth = getKolkataMonthKey();
  const { data } = await supabase
    .from("forgotten_credit_ledger")
    .select("id")
    .eq("user_id", userId)
    .eq("source", "monthly_free")
    .eq("period_month", periodMonth)
    .maybeSingle();
  if (!data) {
    const { error } = await supabase.from("forgotten_credit_ledger").insert({
      user_id: userId,
      source: "monthly_free",
      quantity: 2,
      period_month: periodMonth,
    });
    if (error && error.code !== "23505") throw error;
  }
}

export async function getForgottenCreditBalance(userId: string): Promise<CreditBalance> {
  await ensureMonthlyFreeCredits(userId);
  const periodMonth = getKolkataMonthKey();
  const { data, error } = await supabaseAdmin()
    .from("forgotten_credit_ledger")
    .select("source, quantity, period_month")
    .eq("user_id", userId);
  if (error) throw error;

  const rows = (data ?? []) as { source: string; quantity: number; period_month: string | null }[];
  const freeGranted = rows
    .filter((row) => row.source === "monthly_free" && row.period_month === periodMonth)
    .reduce((total, row) => total + row.quantity, 0);
  const paidGranted = rows
    .filter((row) => row.source === "paid")
    .reduce((total, row) => total + row.quantity, 0);
  const consumed = rows
    .filter((row) => row.source === "consumed")
    .reduce((total, row) => total + Math.abs(row.quantity), 0);
  return {
    freeGranted,
    paidGranted,
    consumed,
    remaining: Math.max(0, freeGranted + paidGranted - consumed),
    periodMonth,
  };
}

export async function consumeForgottenCredit(userId: string, pinId: string) {
  const balance = await getForgottenCreditBalance(userId);
  if (balance.remaining <= 0) {
    throw new Error("No forgotten pins left. Buy 10 more for Rs 10 to continue.");
  }
  const { error } = await supabaseAdmin().from("forgotten_credit_ledger").insert({
    user_id: userId,
    source: "consumed",
    quantity: 1,
    period_month: balance.periodMonth,
    pin_id: pinId,
  });
  if (error) throw error;
}
