import Link from "next/link";
import { HomeMusicMotifs } from "@/components/HomeMusicMotifs";
import { PracticeHubExercises } from "@/components/PracticeHubExercises";
import { SiteFooter } from "@/components/SiteFooter";

export default function Home() {
  return (
    <>
      <div className="musai-home">
        <HomeMusicMotifs />

        <Link
          href="/settings"
          className="musai-home__settings"
          aria-label="Settings"
        >
          <svg
            viewBox="0 0 24 24"
            width={18}
            height={18}
            className="musai-home__settings-icon h-[18px] w-[18px]"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
          </svg>
        </Link>

        <header className="musai-home__brand">
          <div className="musai-hero-brand musai-home__hero">
            <div className="musai-wordmark-glow">
              <h1 className="musai-wordmark musai-home__wordmark">
                <span className="musai-wordmark__mus">Mus</span>
                <span className="musai-wordmark__ai">AI</span>
              </h1>
            </div>
          </div>
        </header>

        <div className="musai-home__main">
          <PracticeHubExercises />
        </div>
      </div>
      <SiteFooter />
    </>
  );
}
