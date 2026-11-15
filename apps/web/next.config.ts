import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@card-table/shared"],
  output: "standalone",
};

export default nextConfig;
