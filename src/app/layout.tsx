import type { Metadata } from "next";
import { Fraunces, Source_Sans_3 } from "next/font/google";
import { AmbientBackground } from "@/components/AmbientBackground";
import { PreferLocalhost } from "@/components/PreferLocalhost";
import { SiteFooter } from "@/components/SiteFooter";
import "./globals.css";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
});

const sourceSans = Source_Sans_3({
  variable: "--font-source-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MusAI",
  description:
    "Violin practice assistant. Clear intonation feedback from your recordings.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${sourceSans.variable} h-full antialiased`}
    >
      <body className="musai-app-body flex min-h-full flex-col font-sans text-[var(--musai-ink)]">
        <PreferLocalhost />
        <AmbientBackground />
        <div className="flex flex-1 flex-col">{children}</div>
        <SiteFooter />
      </body>
    </html>
  );
}
