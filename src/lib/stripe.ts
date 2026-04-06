import Stripe from "stripe";
import { STRIPE } from "@/lib/constants";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(STRIPE.secretKey, {
      apiVersion: "2025-03-31.basil",
    });
  }
  return _stripe;
}
