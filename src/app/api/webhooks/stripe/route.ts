import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/server/db/prisma";
import { getStripe } from "@/lib/stripe";

const PRICE_TO_PLAN: Record<string, "STARTER" | "PRO"> = {
  [process.env.STRIPE_PRICE_ID_STARTER || ""]: "STARTER",
  [process.env.STRIPE_PRICE_ID_PRO || ""]: "PRO",
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
      process.env.STRIPE_WEBHOOK_SECRET || ""
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

      await prisma.subscription.updateMany({
        where: { userId },
        data: {
          stripeSubscriptionId: sub.id,
          stripePriceId: priceId,
          status: sub.status,
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
        },
      });

      await prisma.user.update({
        where: { id: userId },
        data: { planTier },
      });
      break;
    }

    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const customerId =
        typeof sub.customer === "string" ? sub.customer : sub.customer;

      const subscription = await prisma.subscription.findFirst({
        where: { stripeCustomerId: customerId as string },
      });

      if (subscription) {
        const item = sub.items.data[0];
        const periodStart = item?.current_period_start
          ? new Date(item.current_period_start * 1000)
          : undefined;
        const periodEnd = item?.current_period_end
          ? new Date(item.current_period_end * 1000)
          : undefined;

        await prisma.subscription.update({
          where: { id: subscription.id },
          data: {
            status: sub.status,
            ...(periodStart && { currentPeriodStart: periodStart }),
            ...(periodEnd && { currentPeriodEnd: periodEnd }),
          },
        });

        if (sub.status === "canceled" || sub.status === "unpaid") {
          await prisma.user.update({
            where: { id: subscription.userId },
            data: { planTier: "FREE" },
          });
        }
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}
