import { NextResponse } from "next/server";
import { getUpdateState } from "@/lib/selfUpdate";
import { getDockerUpdateState, dockerSelfUpdateAvailable, buildManualDockerCommand } from "@/lib/dockerSelfUpdate";

export const dynamic = "force-dynamic";

export async function GET() {
  const base = getUpdateState();
  if (base.installMode === "docker") {
    const d = getDockerUpdateState();
    const manualCommand = await buildManualDockerCommand().catch(() => null);
    return NextResponse.json({ ...d, selfUpdate: dockerSelfUpdateAvailable(), manualCommand });
  }
  return NextResponse.json(base);
}
