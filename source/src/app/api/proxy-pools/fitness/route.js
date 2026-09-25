import { NextResponse } from "next/server";
import { poolFitnessSnapshot } from "open-sse/services/proxyPoolFitness.js";
import { requireDashboardAuth } from "@/lib/auth/routeAuth.js";

export async function GET(request) {
  if (!await requireDashboardAuth(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { return NextResponse.json({ pools: await poolFitnessSnapshot() }); }
  catch (error) { console.log("Error reading proxy fitness:", error); return NextResponse.json({ error: "Failed to read proxy fitness" }, { status: 500 }); }
}
