import { NextResponse, type NextRequest } from "next/server";
import { Role } from "@/lib/constants/enums";
import { getSession } from "@/lib/auth/session";
import { getRoadPath } from "@/lib/routing/osrm";
import { roadPathRequestSchema } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (session.role !== Role.FACILITIES && session.role !== Role.SUPER_ADMIN) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  let points: unknown;
  try {
    points = JSON.parse(params.get("points") ?? "");
  } catch {
    return NextResponse.json({ error: "Invalid route points." }, { status: 400 });
  }

  const parsed = roadPathRequestSchema.safeParse({
    points,
    constrainBearings: params.get("bearings") === "true",
    overview: params.get("overview") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid route request." }, { status: 400 });
  }

  const roadPath = await getRoadPath(
    parsed.data.points.map(([lat, lng]) => ({ lat, lng })),
    {
      constrainBearings: parsed.data.constrainBearings,
      overview: parsed.data.overview,
    }
  );
  if (!roadPath) {
    return NextResponse.json({ error: "No drivable route found." }, { status: 502 });
  }
  return NextResponse.json(roadPath, {
    headers: { "Cache-Control": "private, max-age=60" },
  });
}