import type { CSSProperties } from "react";
import { Droplets, Wind } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  describeWeatherCode,
  getDhakaWeather,
  type DhakaWeather,
} from "@/lib/queries/weather";

/**
 * WeatherWidget — Dhaka conditions styled as a frosted-glass "app icon"
 * squircle (per user reference): glossy blue glass, CSS sun/cloud art, big
 * temperature, humidity | wind footer. Server component: data comes from
 * Open-Meteo (free, keyless) with a shared 10-minute ISR cache, so it adds
 * no upstream cost per user. Any fetch failure renders a quiet placeholder
 * inside the same glass shell instead of breaking the dashboard.
 */
export async function WeatherWidget({ className }: { className?: string }) {
  const weather = await getDhakaWeather();

  return (
    <section
      aria-label="Dhaka weather"
      className={cn(
        // Subtle entrance — the only motion on the card.
        "animate-in fade-in slide-in-from-right-2 duration-500 motion-reduce:animate-none",
        "relative isolate mx-auto h-[185px] w-[160px] shrink-0 overflow-hidden rounded-[20px] sm:mx-0",
        "border border-white/50 backdrop-blur-md",
        "bg-gradient-to-b from-[#8ab9e6]/85 via-[#6493d0]/85 to-[#4573b8]/90",
        "shadow-[0_14px_32px_-10px_rgba(37,64,110,0.45),inset_0_1px_0_rgba(255,255,255,0.5)]",
        className
      )}
    >
      {/* Glass sheen: inner highlight ring + top light bloom */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[20px] ring-1 ring-inset ring-white/25"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -top-14 left-1/2 h-28 w-[140%] -translate-x-1/2 rounded-full bg-white/25 blur-2xl"
      />
      <GlassDroplets />

      {weather ? (
        <WeatherBody weather={weather} />
      ) : (
        <div className="relative flex h-[185px] items-center justify-center px-3">
          <p className="text-sm font-medium text-white/85 drop-shadow-sm">
            Weather unavailable
          </p>
        </div>
      )}
    </section>
  );
}

/** Water droplets that ROAM the whole glass pane — each one drifts until it
 * touches a border, rebounds inward, glides across to the far side, and
 * returns. Small, glossy condensation beads on a cold window. */
function GlassDroplets() {
  const drops = [
    { top: "14%", left: "16%", size: 10, opacity: 0.8, rx: 32, ry: 26 },
    { top: "22%", left: "70%", size: 6, opacity: 0.7, rx: -38, ry: 20 },
    { top: "46%", left: "58%", size: 11, opacity: 0.85, rx: -30, ry: -26 },
    { top: "55%", left: "20%", size: 8, opacity: 0.8, rx: 30, ry: -32 },
    { top: "78%", left: "34%", size: 9, opacity: 0.8, rx: 26, ry: -20 },
  ];
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0">
      {drops.map((d, i) => (
        <span
          key={i}
          className="glass-drop absolute rounded-full border border-white/50"
          style={
            {
              top: d.top,
              left: d.left,
              width: d.size,
              height: d.size,
              opacity: d.opacity,
              background:
                "radial-gradient(circle at 30% 28%, rgba(255,255,255,0.98), rgba(224,240,255,0.45) 55%, rgba(255,255,255,0.18) 100%)",
              boxShadow:
                "inset -1px -2px 3px rgba(58,98,158,0.6), inset 1px 1px 2px rgba(255,255,255,1), 0 1px 3px rgba(23,52,94,0.3)",
              // Per-drop roam vector + rhythm so they never sync up.
              "--rx": `${d.rx}px`,
              "--ry": `${d.ry}px`,
              animationDuration: `${(11 + (i % 4) * 2).toFixed(1)}s`,
              animationDelay: `${(i * 1.1).toFixed(1)}s`,
            } as CSSProperties
          }
        />
      ))}
    </span>
  );
}

function WeatherBody({ weather }: { weather: DhakaWeather }) {
  const { label } = describeWeatherCode(weather.code, weather.isDay);

  return (
    <div className="relative flex h-[185px] flex-col items-center px-3 pb-2 pt-3.5 text-center">
      <p className="text-sm font-medium tracking-wide text-white drop-shadow-sm">
        Dhaka
      </p>

      <SkyArt code={weather.code} isDay={weather.isDay} />

      <p className="mt-0.5 text-[34px] font-semibold leading-none tracking-tight text-white tabular-nums [text-shadow:0_2px_10px_rgba(23,52,94,0.35)]">
        {weather.temperature}°
      </p>
      <p className="mt-1 text-[12px] font-medium leading-tight text-white/90">{label}</p>

      <div className="mt-2.5 flex w-full items-center justify-center gap-2 border-t border-white/25 pt-1.5 text-xs font-medium text-white/90">
        <span className="flex items-center gap-1">
          <Droplets className="size-3.5 text-white/75" aria-hidden />
          {weather.humidity}%
        </span>
        <span aria-hidden className="h-3.5 w-px bg-white/30" />
        <span className="flex items-center gap-1">
          <Wind className="size-3.5 text-white/75" aria-hidden />
          {weather.windSpeed} km/h
        </span>
      </div>
    </div>
  );
}

/**
 * Soft 3D-style weather art in CSS — composition follows the actual code:
 * clear = bare sun/moon, partly cloudy = orb tucked behind the cloud,
 * overcast = cloud only. Rain tints the cloud slate, snow gives it an icy
 * tint. No image assets; stays crisp at any size.
 */
function SkyArt({ code, isDay }: { code: number; isDay: boolean }) {
  const clear = code === 0 || code === 1;
  const overcast = code === 3 || code === 45 || code === 48;
  const rainy = [
    51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99,
  ].includes(code);
  const snowy = [71, 73, 75, 77, 85, 86].includes(code);
  // Whole composition follows the clock: warm daylight tones vs muted
  // dusk-blue cloud + cream moon, so the icon never clashes with its time.
  const night = !isDay;

  return (
    <div aria-hidden className="relative mt-1.5 h-10 w-[72px]">
      {/* Sun / moon orb (hidden when fully overcast) */}
      {!overcast ? (
        <div
          className={cn(
            "absolute rounded-full",
            clear ? "left-1/2 top-0 size-10 -translate-x-1/2" : "right-0.5 top-0 size-8",
            isDay
              ? "bg-[radial-gradient(circle_at_32%_30%,#ffeaa6,#ffc93d_62%,#f0a93c)] shadow-[0_0_22px_rgba(255,199,80,0.65)]"
              : "bg-[radial-gradient(circle_at_32%_30%,#fffdf4,#f3eec9_55%,#d8d0a2)] shadow-[0_0_18px_rgba(255,253,240,0.95),0_0_38px_rgba(240,235,200,0.5),inset_-3px_-4px_9px_rgba(150,128,66,0.4)]"
          )}
        />
      ) : null}
      {/* Cloud: base pill + two puffs (skipped for clear sky) */}
      {!clear ? (
        <>
          <div
            className={cn(
              "absolute bottom-0 left-0 h-4 w-full rounded-full bg-gradient-to-b shadow-[0_8px_14px_-5px_rgba(23,52,94,0.5)]",
              night
                ? rainy
                  ? "from-[#e0e9f7] to-[#8ba1c2]"
                  : snowy
                    ? "from-[#eaf2fc] to-[#c6d6ec]"
                    : overcast
                      ? "from-[#dfe8f6] to-[#93a8c8]"
                      : "from-[#e4edfa] to-[#a8bcd9]"
                : rainy
                  ? "from-white to-[#bccfe9]"
                  : snowy
                    ? "from-white to-[#e9f2fd]"
                    : overcast
                      ? "from-white to-[#c9d6e6]"
                      : "from-white to-[#d7e6fa]"
            )}
          />
          <div
            className={cn(
              "absolute bottom-1.5 left-1 size-7 rounded-full bg-gradient-to-b",
              night
                ? snowy
                  ? "from-[#eef4fd] to-[#cddcee]"
                  : "from-[#eef4fd] to-[#b3c5de]"
                : snowy
                  ? "from-white to-[#eef5fd]"
                  : "from-white to-[#e3eefc]"
            )}
          />
          <div
            className={cn(
              "absolute bottom-1 left-5 size-9 rounded-full bg-gradient-to-b",
              night
                ? rainy
                  ? "from-[#ecf2fc] to-[#96abc9]"
                  : snowy
                    ? "from-[#f0f5fd] to-[#d2dfee]"
                    : "from-[#ecf2fc] to-[#aebfd9]"
                : rainy
                  ? "from-white to-[#c6d7ee]"
                  : snowy
                    ? "from-white to-[#ecf4fe]"
                    : "from-white to-[#dbe9fb]"
            )}
          />
        </>
      ) : null}
    </div>
  );
}