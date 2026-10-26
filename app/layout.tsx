import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Vibe96 — Your next big thing. Already built.",
  description:
    "Discover software, meet its builders, and make it yours. A transparent software marketplace.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
