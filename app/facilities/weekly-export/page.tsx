import { redirect } from "next/navigation";

export default async function WeeklyExportPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const { week } = await searchParams;
  const query = week ? `?week=${encodeURIComponent(week)}` : "";

  redirect(`/facilities/route-planning${query}`);
}