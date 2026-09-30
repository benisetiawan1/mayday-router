import { NextResponse } from "next/server";
import { getUpdateState } from "@/lib/selfUpdate";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getUpdateState());
}
