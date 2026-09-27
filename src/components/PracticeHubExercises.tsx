"use client";

import Link from "next/link";
import { useInstrument } from "@/components/InstrumentProvider";
import { useAnimeEntrance } from "@/hooks/useAnimeEntrance";
import { PIECE_STUDIO_HREF } from "@/features/piece-studio/pieceStudioRoutes";
import { tapFeedback } from "@/lib/motion";

const practiceTools = [
  {
    href: "/practice/tuner",
    label: "Tuner",
    tone: "tuner",
  },
  {
    href: "/practice/single-note",
    label: "Tuning trainer",
    tone: "trainer",
  },
] as const;

const studios = [
  {
    href: "/practice/scale",
    label: "Scale studio",
    tone: "scale",
  },
  {
    href: PIECE_STUDIO_HREF,
    label: "Piece studio",
    tone: "piece",
  },
] as const;

const STRING_INK = [
  "var(--musai-string-1)",
  "var(--musai-string-2)",
  "var(--musai-string-3)",
  "var(--musai-string-4)",
] as const;

function PianoMark() {
  const whites = [4, 12, 20, 28, 36, 44];
  const blacks = [10, 18, 34, 42];
  return (
    <svg viewBox="0 0 58 50" aria-hidden>
      {whites.map((x) => (
        <rect
          key={x}
          x={x}
          y={6}
          width={7.2}
          height={36}
          rx={1}
          fill="var(--musai-notation, var(--musai-ink))"
        />
      ))}
      {blacks.map((x) => (
        <rect
          key={`b-${x}`}
          x={x}
          y={6}
          width={4.2}
          height={20}
          rx={0.6}
          fill="var(--musai-bg)"
        />
      ))}
    </svg>
  );
}

function TunerMark() {
  const { instrument } = useInstrument();
  if (instrument.openStrings.length === 0) return <PianoMark />;
  const strings = instrument.openStrings;
  const count = strings.length;
  const xs = strings.map((_, i) =>
    count <= 1 ? 29 : 8 + (42 * i) / (count - 1),
  );
  const first = xs[0] ?? 8;
  const last = xs[xs.length - 1] ?? 50;
  return (
    <svg viewBox="0 0 58 50" aria-hidden>
      <line
        x1={first - 3}
        x2={last + 3}
        y1="4"
        y2="4"
        stroke="var(--musai-staff-line)"
        strokeWidth="1.1"
      />
      {strings.map((s, i) => {
        const x = xs[i]!;
        const color = STRING_INK[i % STRING_INK.length]!;
        const gauge = 2.05 - (count <= 1 ? 0 : (0.95 * i) / (count - 1));
        return (
          <g key={s.id}>
            <line
              x1={x}
              x2={x}
              y1="4"
              y2="31"
              stroke={color}
              strokeWidth={gauge}
              strokeLinecap="butt"
            />
            <text
              x={x}
              y="45"
              textAnchor="middle"
              fill={color}
              fontSize="12"
              fontWeight="700"
              fontFamily="var(--font-source-sans), system-ui, sans-serif"
            >
              {s.id}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function TrainerMark() {
  const dots = Array.from({ length: 12 }, (_, i) => {
    const angle = (i / 12) * Math.PI * 2 - Math.PI / 2;
    return {
      cx: 28 + Math.cos(angle) * 15,
      cy: 22 + Math.sin(angle) * 15,
      on: i === 0,
    };
  });
  return (
    <svg viewBox="0 0 56 44" aria-hidden>
      <circle
        cx="28"
        cy="22"
        r="15"
        fill="none"
        stroke="var(--musai-staff-line)"
        strokeWidth="1.35"
      />
      {dots.map((d, i) => (
        <circle
          key={i}
          cx={d.cx}
          cy={d.cy}
          r={d.on ? 2.6 : 1.45}
          fill={d.on ? "var(--musai-accent)" : "var(--musai-staff-line)"}
          opacity={d.on ? 1 : 0.95}
        />
      ))}
    </svg>
  );
}

function ScaleMark() {
  const notes = [
    { x: 8, y: 27, fill: "var(--musai-accent)" },
    { x: 18, y: 23, fill: "var(--musai-pitch-high)" },
    { x: 28, y: 19, fill: "var(--musai-pitch-low)" },
    { x: 38, y: 15, fill: "var(--musai-accent)" },
    { x: 48, y: 19, fill: "var(--musai-pitch-high)" },
    { x: 58, y: 23, fill: "var(--musai-accent)" },
  ];
  return (
    <svg viewBox="0 0 68 40" aria-hidden>
      {[10, 15, 20, 25, 30].map((y) => (
        <line
          key={y}
          x1="2"
          x2="66"
          y1={y}
          y2={y}
          stroke="var(--musai-staff-line)"
          strokeWidth="0.7"
        />
      ))}
      {notes.map((n) => (
        <g key={n.x}>
          <line
            x1={n.x + 2.4}
            x2={n.x + 2.4}
            y1={n.y - 1.2}
            y2={n.y - 9}
            stroke={n.fill}
            strokeWidth="0.9"
            strokeLinecap="butt"
          />
          <ellipse
            cx={n.x}
            cy={n.y}
            rx="3.15"
            ry="2.25"
            transform={`rotate(-18 ${n.x} ${n.y})`}
            fill={n.fill}
          />
        </g>
      ))}
    </svg>
  );
}

function PieceMark() {
  return (
    <svg viewBox="0 0 68 40" aria-hidden>
      {[10, 15, 20, 25, 30].map((y) => (
        <line
          key={y}
          x1="2"
          x2="66"
          y1={y}
          y2={y}
          stroke="var(--musai-staff-line)"
          strokeWidth="0.7"
        />
      ))}
      <ellipse cx="16" cy="22" rx="3" ry="2.2" transform="rotate(-18 16 22)" fill="var(--musai-ink)" />
      <ellipse cx="32" cy="16" rx="3" ry="2.2" transform="rotate(-18 32 16)" fill="var(--musai-pitch-high)" />
      <ellipse cx="48" cy="20" rx="3" ry="2.2" transform="rotate(-18 48 20)" fill="var(--musai-pitch-low)" />
      <path
        d="M29 8.5h8"
        stroke="var(--musai-accent-2)"
        strokeWidth="1.4"
        strokeLinecap="butt"
      />
      <path
        d="M45 11.5h7"
        stroke="var(--musai-pitch-low)"
        strokeWidth="1.4"
        strokeLinecap="butt"
      />
    </svg>
  );
}

function CardMark({
  tone,
}: {
  tone: (typeof practiceTools)[number]["tone"] | (typeof studios)[number]["tone"];
}) {
  if (tone === "tuner") return <TunerMark />;
  if (tone === "trainer") return <TrainerMark />;
  if (tone === "scale") return <ScaleMark />;
  return <PieceMark />;
}

function ExerciseLink({
  href,
  label,
  tone,
  kind,
}: {
  href: string;
  label: string;
  tone: (typeof practiceTools)[number]["tone"] | (typeof studios)[number]["tone"];
  kind: "tool" | "studio";
}) {
  return (
    <Link
      data-anime-enter
      href={href}
      aria-label={label}
      onPointerDown={() => tapFeedback("light")}
      className={`musai-exercise-card musai-exercise-card--${kind} musai-exercise-card--${tone}`}
    >
      <span className="musai-exercise-card__label">{label}</span>
      <span className="musai-exercise-card__mark">
        <CardMark tone={tone} />
      </span>
    </Link>
  );
}

/**
 * Practice hub — quick tools above deeper studios.
 * Each card carries a small picture of the tool itself.
 */
export function PracticeHubExercises() {
  const ref = useAnimeEntrance<HTMLElement>({ delay: 120 });

  return (
    <section
      ref={ref}
      id="features"
      aria-labelledby="features-heading"
      className="musai-home-exercises"
    >
      <h2 id="features-heading" className="sr-only">
        Practice
      </h2>

      <div
        className="musai-home-exercises__group musai-home-exercises__group--tools"
        aria-labelledby="practice-tools-heading"
      >
        <h3 id="practice-tools-heading" className="musai-home-exercises__title">
          Practice tools
        </h3>
        <div className="musai-home-exercises__grid musai-home-exercises__grid--tools">
          {practiceTools.map((ex) => (
            <ExerciseLink key={ex.href} {...ex} kind="tool" />
          ))}
        </div>
      </div>

      <div
        className="musai-home-exercises__group musai-home-exercises__group--studios"
        aria-labelledby="studios-heading"
      >
        <h3 id="studios-heading" className="musai-home-exercises__title">
          Studios
        </h3>
        <div className="musai-home-exercises__grid musai-home-exercises__grid--studios">
          {studios.map((ex) => (
            <ExerciseLink key={ex.href} {...ex} kind="studio" />
          ))}
        </div>
      </div>
    </section>
  );
}
