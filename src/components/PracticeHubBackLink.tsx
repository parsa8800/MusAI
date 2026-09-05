import Link from "next/link";

/**
 * Return to the main practice hub (`/`). Use at the top of every exercise route
 * so users can leave without finishing or waiting for results.
 */
export function PracticeHubBackLink() {
  return (
    <div className="mb-5 w-full sm:mb-6">
      <Link
        href="/"
        className="group inline-flex items-center gap-2.5 rounded-full border border-white/[0.09] bg-white/[0.035] py-1.5 pl-1.5 pr-3.5 text-[13px] font-medium text-zinc-500 shadow-[0_6px_24px_rgba(0,0,0,0.22)] backdrop-blur-xl transition-[border-color,background-color,color,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-white/[0.12] hover:bg-white/[0.06] hover:text-zinc-300 active:scale-[0.98] motion-reduce:active:scale-100"
        aria-label="Back to practice hub"
      >
        <span
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/[0.07] bg-white/[0.05] text-zinc-400 transition-[border-color,background-color,color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:border-white/[0.1] group-hover:bg-white/[0.08] group-hover:text-zinc-200"
          aria-hidden
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="h-4 w-4"
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.75 19.5 8.25 12l7.5-7.5"
            />
          </svg>
        </span>
        <span>Practice hub</span>
      </Link>
    </div>
  );
}
