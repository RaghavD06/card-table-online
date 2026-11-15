import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: { ink: "#0a1020", felt: "#0e3b32", gold: "#d8b36a" },
      boxShadow: { glow: "0 0 48px rgba(216, 179, 106, 0.12)" },
    },
  },
  plugins: [],
};

export default config;
