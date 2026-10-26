import Image from "next/image";
import styles from "./loading-spinner.module.css";

const CX = 172;
const CY = 172;
/** Orbit radii, outer → inner (matches the reference mark). */
const RADII = [150, 124, 98, 72, 48];
/** Seconds per revolution per orbit; negative = counter-clockwise. */
const PERIODS = [9, -7, 6, -5, 4];
const DOT = "#8fe3ea";

function dotAt(radius: number, angleDeg: number) {
  const a = (angleDeg * Math.PI) / 180;
  return { x: CX + radius * Math.cos(a), y: CY + radius * Math.sin(a) };
}

/** Starting angles spread around the dial, like the reference. */
const ANGLES = [15, 140, 250, 320, 200];

/**
 * Concentric-orbit loader (Commure mark): thin white rings on black with a
 * cyan satellite orbiting each ring. Orbits are counter-rotating pairs so the
 * whole dial feels alive while loading.
 */
export function LoadingSpinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-5">
      <div className="relative">
          <svg
            viewBox="0 0 344 344"
            className={styles.loader}
            width="230"
            height="230"
            role="img"
            aria-label={label}
          >
            {RADII.map((r) => (
              <circle
                key={`ring-${r}`}
                cx={CX}
                cy={CY}
                r={r}
                fill="none"
                stroke="#111111"
                strokeOpacity={r === RADII[0] ? 0.45 : 0.85}
                strokeWidth="1.6"
              />
            ))}
            {RADII.map((r, i) => {
              const { x, y } = dotAt(r, ANGLES[i]);
              const period = PERIODS[i];
              return (
                <g
                  key={`sat-${r}`}
                  className={styles.orbit}
                  style={{ animationDuration: `${Math.abs(period)}s`, animationDirection: period < 0 ? "reverse" : "normal" }}
                >
                  <circle cx={x} cy={y} r={r > 100 ? 6 : 5} fill={DOT} />
                </g>
              );
            })}
          </svg>
          {/* Center mark: the Commure knot (white-on-black source, inverted to
              black-on-white) cropped to the knot via cover + zoom. */}
          <div className="absolute left-1/2 top-1/2 size-12 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full bg-background ring-1 ring-black/10">
            <Image
              src="/commure-logo.jpeg"
              alt="Commure"
              width={128}
              height={128}
              className="h-full w-full scale-[1.7] object-cover invert"
              priority
            />
          </div>
        </div>
      <p className="font-display text-sm font-medium tracking-wide text-muted-foreground">
        {label}
      </p>
    </div>
  );
}
