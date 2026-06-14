import { createHmac } from "crypto";
import { config } from "./config";

export function assertRazorpayConfig() {
  const missing = [];
  if (!config.razorpayKeyId) missing.push("RAZORPAY_KEY_ID");
  if (!config.razorpayKeySecret) missing.push("RAZORPAY_KEY_SECRET");
  if (missing.length) throw new Error(`Missing environment variables: ${missing.join(", ")}`);
}

export async function createRazorpayOrder(receipt: string) {
  assertRazorpayConfig();
  const auth = Buffer.from(`${config.razorpayKeyId}:${config.razorpayKeySecret}`).toString("base64");
  const res = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: 1000,
      currency: "INR",
      receipt,
      notes: { product: "forgotten_pin_credits", credits: "10" },
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.description ?? "Could not create Razorpay order");
  return data as { id: string; amount: number; currency: string };
}

export function verifyRazorpaySignature(orderId: string, paymentId: string, signature: string) {
  assertRazorpayConfig();
  const expected = createHmac("sha256", config.razorpayKeySecret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
  return expected === signature;
}
