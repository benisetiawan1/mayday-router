import { NextResponse } from "next/server";
import { startTarballUpdate, fetchLatestTarballRelease, getUpdateState } from "@/lib/selfUpdate";

export const dynamic = "force-dynamic";

export async function POST() {
  if (process.env.NODE_ENV !== "production") {
    return NextResponse.json(
      { success: false, message: "Dashboard update is only available in production builds" },
      { status: 403 }
    );
  }
  const state = getUpdateState();
  if (state.installMode === "docker") {
    return NextResponse.json(
      { success: false, message: "Docker install — pull the new image instead" },
      { status: 400 }
    );
  }
  try {
    const release = await fetchLatestTarballRelease();
    if (!release) {
      return NextResponse.json({ success: false, message: "No downloadable release found" }, { status: 404 });
    }
    // fire-and-forget: progress is polled via /api/update/status
    // (startTarballUpdate records failures into the state machine itself)
    startTarballUpdate(release).catch((e) => {
      console.error("[self-update] failed:", e?.message || e);
    });
    return NextResponse.json({ success: true, targetVersion: release.version });
  } catch (e) {
    return NextResponse.json({ success: false, message: e?.message || "Update failed" }, { status: 500 });
  }
}
