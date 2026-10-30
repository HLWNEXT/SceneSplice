import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "As-Ruined · Entropy Studio",
  description: "Scrub an architectural render forward through time and simulate its decay.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
