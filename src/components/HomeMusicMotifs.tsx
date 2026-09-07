/**
 * Quiet engraved note accents for the practice hub — atmosphere only.
 */
import type { CSSProperties, ReactNode } from "react";

export function HomeMusicMotifs() {
  return (
    <div
      className="musai-home-motifs pointer-events-none absolute inset-0 z-0 overflow-hidden"
      aria-hidden
    >
      <Motif
        className="musai-home-motif musai-home-motif--a left-[4%] top-[18%] hidden sm:block md:left-[8%] md:top-[16%]"
        style={{ ["--musai-motif-rot"]: "-12deg" } as CSSProperties}
      >
        <Crotchet />
      </Motif>

      <Motif
        className="musai-home-motif musai-home-motif--b right-[5%] top-[22%] sm:right-[10%] sm:top-[20%] md:right-[12%]"
        style={{ ["--musai-motif-rot"]: "9deg" } as CSSProperties}
      >
        <BeamedEighths />
      </Motif>

      <Motif
        className="musai-home-motif musai-home-motif--c left-[2%] top-[48%] hidden md:block md:left-[5%]"
        style={{ ["--musai-motif-rot"]: "14deg" } as CSSProperties}
      >
        <Quaver />
      </Motif>

      <Motif
        className="musai-home-motif musai-home-motif--d right-[3%] top-[52%] hidden sm:block md:right-[7%] md:top-[55%]"
        style={{ ["--musai-motif-rot"]: "-8deg" } as CSSProperties}
      >
        <Crotchet />
      </Motif>

      <Motif
        className="musai-home-motif musai-home-motif--e left-[8%] bottom-[12%] sm:left-[14%] sm:bottom-[14%]"
        style={{ ["--musai-motif-rot"]: "6deg" } as CSSProperties}
      >
        <Quaver />
      </Motif>

      <Motif
        className="musai-home-motif musai-home-motif--f bottom-[18%] right-[10%] hidden lg:block"
        style={{ ["--musai-motif-rot"]: "-16deg" } as CSSProperties}
      >
        <BeamedEighths />
      </Motif>
    </div>
  );
}

function Motif({
  className,
  style,
  children,
}: {
  className: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <div className={`absolute ${className}`} style={style}>
      {children}
    </div>
  );
}

function Crotchet() {
  return (
    <svg
      viewBox="0 0 36 64"
      className="h-[3.25rem] w-auto text-[var(--musai-notation)] sm:h-[3.75rem]"
      fill="currentColor"
    >
      <ellipse cx="13" cy="50" rx="11.5" ry="8.2" transform="rotate(-22 13 50)" />
      <rect x="22.5" y="8" width="2.4" height="42" rx="1.1" />
    </svg>
  );
}

function Quaver() {
  return (
    <svg
      viewBox="0 0 40 64"
      className="h-[2.6rem] w-auto text-[var(--musai-notation)] sm:h-[3rem]"
      fill="currentColor"
    >
      <ellipse cx="13" cy="50" rx="11" ry="7.8" transform="rotate(-22 13 50)" />
      <rect x="22" y="8" width="2.3" height="42" rx="1.1" />
      <path d="M24.3 8c8.5 1.2 13.2 7.2 12.2 16.2-1.4 12.4-10.4 16.8-12.2 17.6V36c3.2-1.4 7.6-5.2 8.4-12.2.7-6.2-2.6-10.4-8.4-11.2V8z" />
    </svg>
  );
}

function BeamedEighths() {
  return (
    <svg
      viewBox="0 0 58 64"
      className="h-[2.85rem] w-auto text-[var(--musai-notation)] sm:h-[3.35rem]"
      fill="currentColor"
    >
      <ellipse cx="12" cy="51" rx="10" ry="7.2" transform="rotate(-22 12 51)" />
      <ellipse cx="40" cy="47" rx="10" ry="7.2" transform="rotate(-22 40 47)" />
      <rect x="20.2" y="10" width="2.2" height="40" rx="1" />
      <rect x="48.2" y="10" width="2.2" height="36" rx="1" />
      <path d="M20.2 10h30.2v5.2H20.2z" />
    </svg>
  );
}
