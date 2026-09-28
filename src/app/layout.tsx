import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Fraunces, Source_Sans_3 } from "next/font/google";
import { AmbientBackground } from "@/components/AmbientBackground";
import { InstrumentProvider } from "@/components/InstrumentProvider";
import { PreferLocalhost } from "@/components/PreferLocalhost";
import {
  ThemeProvider,
  THEME_BOOT_SCRIPT,
} from "@/components/ThemeProvider";
import "./globals.css";
import "./device.css";

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

/** Lets env(safe-area-inset-*) work on notched phones. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/**
 * iPhone and iPad only. A Mac browser stays unmarked, so these layouts
 * never apply on the desktop site. iPadOS reports a Mac user agent, but
 * it is the only Mac-platform browser with a real touch screen.
 */
const DEVICE_BOOT_SCRIPT = `(() => {
  try {
    var ua = navigator.userAgent || "";
    var phone = /iPhone|iPod/.test(ua);
    var tablet =
      /iPad/.test(ua) ||
      (!phone && navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (!phone && !tablet) return;
    var shortSide = Math.min(screen.width, screen.height);
    document.documentElement.dataset.musaiDevice =
      phone || shortSide < 520 ? "phone" : "tablet";
  } catch (_) {}
})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${fraunces.variable} ${sourceSans.variable} h-full antialiased`}
    >
      <body className="musai-app-body flex min-h-full flex-col font-sans text-[var(--musai-ink)]">
        <Script
          id="musai-theme-boot"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }}
        />
        <Script
          id="musai-device-boot"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: DEVICE_BOOT_SCRIPT }}
        />
        <ThemeProvider>
          <InstrumentProvider>
            <PreferLocalhost />
            <AmbientBackground />
            <div className="flex flex-1 flex-col">{children}</div>
          </InstrumentProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
