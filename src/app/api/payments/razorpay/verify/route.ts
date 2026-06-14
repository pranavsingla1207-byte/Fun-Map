import { fail, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { verifyRazorpaySignature } from "@/lib/razorpay";
import { supabaseAdmin } from "@/lib/supabase";
import { paymentVerifySchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const input = paymentVerifySchema.parse(await request.json());
    if (!verifyRazorpaySignature(input.razorpay_order_id, input.razorpay_payment_id, input.razorpay_signature)) {
      throw new Error("Payment verification failed");
    }
    const supabase = supabaseAdmin();
    const { data: event, error: eventError } = await supabase
      .from("payment_events")
      .update({
        status: "paid",
        razorpay_payment_id: input.razorpay_payment_id,
        razorpay_signature: input.razorpay_signature,
      })
      .eq("user_id", user.id)
      .eq("razorpay_order_id", input.razorpay_order_id)
      .select("id, credit_quantity")
      .single();
    if (eventError) throw eventError;
    const { error } = await supabase.from("forgotten_credit_ledger").insert({
      user_id: user.id,
      source: "paid",
      quantity: event.credit_quantity,
      payment_event_id: event.id,
    });
    if (error) throw error;
    return ok({ creditsAdded: event.credit_quantity });
  } catch (error) {
    return fail(error, error instanceof Error && error.message === "Unauthorized" ? 401 : 400);
  }
}
