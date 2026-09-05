import Link from "next/link";

const NAV = [
  { href: "/", label: "Practice" },
  { href: "/#features", label: "Features" },
  { href: "/#about", label: "About" },
] as const;

/** Replace with your real profiles when ready. */
const SOCIAL = [
  {
    name: "Instagram",
    href: "https://www.instagram.com/",
    icon: IconInstagram,
  },
  {
    name: "YouTube",
    href: "https://www.youtube.com/",
    icon: IconYouTube,
  },
  {
    name: "TikTok",
    href: "https://www.tiktok.com/",
    icon: IconTikTok,
  },
  {
    name: "LinkedIn",
    href: "https://www.linkedin.com/",
    icon: IconLinkedIn,
  },
  {
    name: "GitHub",
    href: "https://github.com/",
    icon: IconGitHub,
  },
] as const;

function IconInstagram(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={props.className} aria-hidden>
      <rect
        x="3"
        y="3"
        width="18"
        height="18"
        rx="5"
        stroke="currentColor"
        strokeWidth={1.5}
      />
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth={1.5} />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" />
    </svg>
  );
}

function IconYouTube(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={props.className} aria-hidden>
      <path
        d="M14 12l-4 2.5V9.5L14 12z"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      <path
        d="M4 8.5c0-1.2.9-2.1 2-2.3l12-.4c1.2 0 2.2 1 2.2 2.2v7c0 1.2-1 2.2-2.2 2.2l-12 .4c-1.1-.2-2-1.1-2-2.3v-7z"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconTikTok(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={props.className} aria-hidden>
      <path
        d="M14 5v9.5a3.5 3.5 0 11-3.5-3.5V8a5.5 5.5 0 005.5 5.5V10"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconLinkedIn(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={props.className} aria-hidden>
      <path
        d="M8 11v8M8 8h.01M12 11v8M12 11a3 3 0 013-3c1.7 0 3 1.3 3 3v8"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconGitHub(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={props.className} aria-hidden>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 2C6.477 2 2 6.484 2 12.021c0 4.428 2.865 8.184 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.866-.013-1.7-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.203 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0022 12.021C22 6.484 17.522 2 12 2z"
      />
    </svg>
  );
}

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer
      className="relative z-[1] mt-auto border-t border-white/[0.06] bg-black/22 backdrop-blur-xl"
      aria-labelledby="site-footer-heading"
    >
      <div className="mx-auto max-w-5xl px-5 py-12 sm:px-8 sm:py-16">
        <div className="flex flex-col items-center gap-10 text-center md:flex-row md:items-start md:justify-between md:gap-8 md:text-left">
          {/* Brand */}
          <div className="max-w-xs shrink-0">
            <p
              id="site-footer-heading"
              className="text-base font-semibold tracking-tight text-zinc-200"
            >
              MusAI
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-zinc-500">
              AI powered music feedback and training.
            </p>
          </div>

          {/* Nav */}
          <nav
            className="flex flex-col items-center gap-3 sm:flex-row sm:gap-8 md:items-start"
            aria-label="Footer"
          >
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-[13px] font-medium text-zinc-500 transition-[color,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:text-zinc-300"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          {/* Social */}
          <div className="flex shrink-0 flex-wrap items-center justify-center gap-1 sm:gap-0.5 md:justify-end">
            {SOCIAL.map(({ name, href, icon: Icon }) => (
              <a
                key={name}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={name}
                className="flex h-10 w-10 items-center justify-center rounded-lg text-zinc-500 opacity-70 transition-[color,opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.06] hover:text-zinc-300 hover:opacity-100 motion-reduce:hover:scale-100"
              >
                <Icon className="h-5 w-5" />
              </a>
            ))}
          </div>
        </div>

        <div className="mt-12 border-t border-white/[0.04] pt-8 text-center">
          <p className="text-[11px] font-normal tracking-wide text-zinc-600">
            © {year} MusAI. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
