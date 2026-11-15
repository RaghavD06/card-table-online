import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Card Table Online",
  description: "Private multiplayer card tables for friends.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
