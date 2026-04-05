import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db/prisma";
import { getAuthUser, unauthorized, badRequest } from "@/lib/api-utils";
import { getStripe } from "@/lib/stripe";

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const body = await req.json();
  const { priceId } = body;

  if (!priceId) return badRequest("priceId is required");

  const stripe = getStripe();

  let subscription = await prisma.subscription.findFirst({
    where: { userId: user.id },
  });

  let customerId = subscription?.stripeCustomerId;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      metadata: { userId: user.id },
    });
    customerId = customer.id;

    if (subscription) {
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { stripeCustomerId: customerId },
      });
    } else {
      subscription = await prisma.subscription.create({
        data: {
          userId: user.id,
          stripeCustomerId: customerId,
        },
      });
    }
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?checkout=success`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?checkout=cancelled`,
    metadata: { userId: user.id },
  });

  return NextResponse.json({ url: session.url });
}
