import { NextResponse } from "next/server";
import { getUpdateState } from "@/lib/selfUpdate";
import { getDockerUpdateState, dockerSelfUpdateAvailable } from "@/lib/dockerSelfUpdate";

export const dynamic = "force-dynamic";

export async function GET() {
  const base = getUpdateState();
  if (base.installMode === "docker") {
    const d = getDockerUpdateState();
    return NextResponse.json({ ...d, selfUpdate: dockerSelfUpdateAvailable() });
  }
  return NextResponse.json(base);
}
