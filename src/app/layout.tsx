import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AmbientBackground } from "@/components/AmbientBackground";
import { PreferLocalhost } from "@/components/PreferLocalhost";
import { SiteFooter } from "@/components/SiteFooter";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
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
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="musai-app-body flex min-h-full flex-col font-sans text-zinc-100">
        <PreferLocalhost />
        <AmbientBackground />
        <div className="flex flex-1 flex-col">{children}</div>
        <SiteFooter />
      </body>
    </html>
  );
}
