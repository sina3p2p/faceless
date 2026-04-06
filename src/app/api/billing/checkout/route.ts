import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { subscriptions } from "@/server/db/schema";
import { getAuthUser, unauthorized, badRequest } from "@/lib/api-utils";
import { getStripe } from "@/lib/stripe";
import { eq } from "drizzle-orm";
import { APP } from "@/lib/constants";

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const body = await req.json();
  const { priceId } = body;

  if (!priceId) return badRequest("priceId is required");

  const stripe = getStripe();

  const existing = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.userId, user.id),
  });

  let customerId = existing?.stripeCustomerId;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      metadata: { userId: user.id },
    });
    customerId = customer.id;

    if (existing) {
      await db
        .update(subscriptions)
        .set({ stripeCustomerId: customerId })
        .where(eq(subscriptions.id, existing.id));
    } else {
      await db.insert(subscriptions).values({
        userId: user.id,
        stripeCustomerId: customerId,
      });
    }
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${APP.url}/dashboard?checkout=success`,
    cancel_url: `${APP.url}/dashboard?checkout=cancelled`,
    metadata: { userId: user.id },
  });

  return NextResponse.json({ url: session.url });
}
