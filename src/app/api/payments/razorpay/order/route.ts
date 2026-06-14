import { fail, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { createRazorpayOrder } from "@/lib/razorpay";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

export async function POST() {
  try {
    const user = await requireUser();
    const publicKeyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? process.env.RAZORPAY_KEY_ID ?? "";
    if (!publicKeyId) throw new Error("Razorpay public key is missing in environment variables");
    const order = await createRazorpayOrder(`credits_${user.id}_${Date.now()}`);
    const { error } = await supabaseAdmin().from("payment_events").insert({
      user_id: user.id,
      amount_paise: order.amount,
      currency: order.currency,
      status: "created",
      provider: "razorpay",
      razorpay_order_id: order.id,
      credit_quantity: 10,
    });
    if (error) throw error;
    return ok({ orderId: order.id, amount: order.amount, currency: order.currency, keyId: publicKeyId });
  } catch (error) {
    return fail(error, error instanceof Error && error.message === "Unauthorized" ? 401 : 400);
  }
}
