import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { db } from "@/server/db";
import { subscriptions, users } from "@/server/db/schema";
import { getStripe } from "@/lib/stripe";
import { eq } from "drizzle-orm";
import { STRIPE as STRIPE_CONFIG } from "@/lib/constants";

const PRICE_TO_PLAN: Record<string, "STARTER" | "PRO"> = {
  [STRIPE_CONFIG.priceIdStarter]: "STARTER",
  [STRIPE_CONFIG.priceIdPro]: "PRO",
};

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature") || "";
  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      STRIPE_CONFIG.webhookSecret
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Webhook Error: ${message}` },
      { status: 400 }
    );
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId;
      if (!userId) break;

      const sub = await stripe.subscriptions.retrieve(
        session.subscription as string
      );
      const priceId = sub.items.data[0]?.price.id || "";
      const planTier = PRICE_TO_PLAN[priceId] || "STARTER";

      const item = sub.items.data[0];
      const periodStart = item?.current_period_start
        ? new Date(item.current_period_start * 1000)
        : new Date();
      const periodEnd = item?.current_period_end
        ? new Date(item.current_period_end * 1000)
        : new Date();

      await db
        .update(subscriptions)
        .set({
          stripeSubscriptionId: sub.id,
          stripePriceId: priceId,
          status: sub.status,
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
        })
        .where(eq(subscriptions.userId, userId));

      await db
        .update(users)
        .set({ planTier })
        .where(eq(users.id, userId));
      break;
    }

    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const customerId =
        typeof sub.customer === "string" ? sub.customer : sub.customer;

      const existing = await db.query.subscriptions.findFirst({
        where: eq(subscriptions.stripeCustomerId, customerId as string),
      });

      if (existing) {
        const item = sub.items.data[0];
        const periodStart = item?.current_period_start
          ? new Date(item.current_period_start * 1000)
          : undefined;
        const periodEnd = item?.current_period_end
          ? new Date(item.current_period_end * 1000)
          : undefined;

        await db
          .update(subscriptions)
          .set({
            status: sub.status,
            ...(periodStart && { currentPeriodStart: periodStart }),
            ...(periodEnd && { currentPeriodEnd: periodEnd }),
          })
          .where(eq(subscriptions.id, existing.id));

        if (sub.status === "canceled" || sub.status === "unpaid") {
          await db
            .update(users)
            .set({ planTier: "FREE" })
            .where(eq(users.id, existing.userId));
        }
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}
