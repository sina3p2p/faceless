"use client";

import { Warp } from "@paper-design/shaders-react";

// Theme floor → pure black for maximum depth in the shader
// oklch(0.165) → card ≈ hsl(0,0%,9%) is the darkest theme token
const COLORS = [
  "hsl(0, 0%, 0%)",
  "hsl(0, 0%, 4%)",
  "hsl(0, 0%, 9%)",
  "hsl(0, 0%, 2%)",
];

export function WarpShaderBackground() {
  return (
    <div className="absolute inset-0 pointer-events-none" aria-hidden>
      <Warp
        style={{ width: "100%", height: "100%" }}
        colors={COLORS}
        proportion={0.8}
        softness={0.9}
        distortion={0.12}
        swirl={0.9}
        swirlIterations={4}
        shape="checks"
        shapeScale={0.12}
        scale={1}
        rotation={0}
        speed={5}
      />
    </div>
  );
}
