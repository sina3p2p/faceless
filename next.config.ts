import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@remotion/lambda"],
  allowedDevOrigins: ["192.168.1.59", "c151-185-183-214-186.ngrok-free.app"],
};

export default nextConfig;
