import "server-only";
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudHail,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSnow,
  CloudSun,
  Moon,
  Sun,
  type LucideIcon,
} from "lucide-react";

/**
 * Dhaka weather — fetched from Open-Meteo (free, keyless, open source).
 * Current conditions only. Cached with ISR (10 min) so every role dashboard
 * shares one upstream call; any failure resolves to `null` and the widget
 * renders a quiet placeholder.
 */

export type DhakaWeather = {
  temperature: number;
  feelsLike: number;
  humidity: number;
  windSpeed: number;
  code: number;
  isDay: boolean;
  /** ISO instant of the upstream observation, for a "as of HH:mm" line. */
  observedAt: string;
};

/** Dhaka (Gulistan area) — good enough for a city-level forecast. */
const DHAKA_LAT = 23.8103;
const DHAKA_LON = 90.4125;
const DHAKA_TZ = "Asia/Dhaka";
const REVALIDATE_SECONDS = 600;

const CODE_LABELS: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Rime fog",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Heavy drizzle",
  56: "Freezing drizzle",
  57: "Freezing drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  66: "Freezing rain",
  67: "Freezing rain",
  71: "Light snow",
  73: "Snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Light showers",
  81: "Showers",
  82: "Heavy showers",
  85: "Snow showers",
  86: "Snow showers",
  95: "Thunderstorm",
  96: "Storm with hail",
  99: "Storm with hail",
};

export function describeWeatherCode(
  code: number,
  isDay = true
): { label: string; Icon: LucideIcon } {
  let Icon: LucideIcon = Cloud;
  if (code === 0) {
    Icon = isDay ? Sun : Moon;
  } else if (code === 1 || code === 2) {
    Icon = isDay ? CloudSun : CloudMoon;
  } else if (code === 3) {
    Icon = Cloud;
  } else if (code === 45 || code === 48) {
    Icon = CloudFog;
  } else if (code >= 51 && code <= 57) {
    Icon = CloudDrizzle;
  } else if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) {
    Icon = CloudRain;
  } else if ((code >= 71 && code <= 77) || code === 85 || code === 86) {
    Icon = CloudSnow;
  } else if (code === 95) {
    Icon = CloudLightning;
  } else if (code === 96 || code === 99) {
    Icon = CloudHail;
  }
  return { label: CODE_LABELS[code] ?? "Unknown", Icon };
}

type OpenMeteoResponse = {
  current?: {
    time?: string;
    temperature_2m?: number;
    relative_humidity_2m?: number;
    apparent_temperature?: number;
    is_day?: number;
    weather_code?: number;
    wind_speed_10m?: number;
  };
};



export async function getDhakaWeather(): Promise<DhakaWeather | null> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(DHAKA_LAT));
  url.searchParams.set("longitude", String(DHAKA_LON));
  url.searchParams.set(
    "current",
    "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m"
  );
  url.searchParams.set("timezone", DHAKA_TZ);

  try {
    const res = await fetch(url, {
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (!res.ok) return null;

    const data = (await res.json()) as OpenMeteoResponse;
    const current = data.current;
    if (!current) return null;

    return {
      temperature: Math.round(current.temperature_2m ?? 0),
      feelsLike: Math.round(current.apparent_temperature ?? 0),
      humidity: Math.round(current.relative_humidity_2m ?? 0),
      windSpeed: Math.round(current.wind_speed_10m ?? 0),
      code: current.weather_code ?? 0,
      isDay: current.is_day !== 0,
      observedAt: current.time ?? "",
    };
  } catch {
    // Network/upstream trouble must never take a dashboard down.
    return null;
  }
}