"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const PLANS = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    features: ["3 videos/month", "All niches", "HD output", "Styled captions"],
    priceId: null,
    current: true,
  },
  {
    name: "Starter",
    price: "$19",
    period: "/month",
    features: [
      "30 videos/month",
      "All niches",
      "HD output",
      "All caption styles",
      "Priority rendering",
    ],
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_STARTER,
    current: false,
    highlighted: true,
  },
  {
    name: "Pro",
    price: "$49",
    period: "/month",
    features: [
      "100 videos/month",
      "All niches",
      "HD output",
      "All caption styles",
      "Priority rendering",
      "Custom voices",
      "Priority support",
    ],
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_PRO,
    current: false,
  },
];

export default function BillingPage() {
  const [loading, setLoading] = useState<string | null>(null);

  async function handleUpgrade(priceId: string) {
    setLoading(priceId);
    const res = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ priceId }),
    });
    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    }
    setLoading(null);
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Billing</h1>
        <p className="text-gray-400 mt-1">
          Manage your subscription and upgrade for more videos.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {PLANS.map((plan) => (
          <Card
            key={plan.name}
            className={
              plan.highlighted
                ? "border-violet-500/50 bg-violet-500/5"
                : ""
            }
          >
            <CardContent className="py-8">
              <h3 className="text-lg font-semibold mb-2">{plan.name}</h3>
              <div className="mb-6">
                <span className="text-3xl font-bold">{plan.price}</span>
                <span className="text-gray-400 text-sm">{plan.period}</span>
              </div>

              <ul className="space-y-2 mb-8">
                {plan.features.map((f) => (
                  <li
                    key={f}
                    className="flex items-center gap-2 text-sm text-gray-300"
                  >
                    <svg
                      className="w-4 h-4 text-violet-400 shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>

              {plan.priceId ? (
                <Button
                  variant={plan.highlighted ? "primary" : "outline"}
                  className="w-full"
                  loading={loading === plan.priceId}
                  onClick={() => handleUpgrade(plan.priceId!)}
                >
                  Upgrade
                </Button>
              ) : (
                <Button variant="ghost" className="w-full" disabled>
                  Current Plan
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
