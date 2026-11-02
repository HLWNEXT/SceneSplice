import type { Metadata } from "next";
import { Space_Mono } from "next/font/google";
import "./globals.css";

const spaceMono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
  variable: "--font-space-mono",
});

export const metadata: Metadata = {
  title: "SceneSplice",
  description: "Splice scenes through time: simulate architectural decay and branching what-if futures with ComfyUI.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={spaceMono.variable} suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
