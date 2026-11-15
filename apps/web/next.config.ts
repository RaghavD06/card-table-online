import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@card-table/shared", "@card-table/socket-contracts", "@card-table/game-engine"],
};

export default nextConfig;
