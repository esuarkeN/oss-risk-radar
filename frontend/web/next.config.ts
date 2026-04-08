import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@oss-risk-radar/schemas"],
};

export default nextConfig;
