import { NextResponse } from "next/server";
import { importFromHermes, readMemory, appendEntry } from "@/lib/plugins/hermes/memory.js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/hermes/memory?target=memory|user — read Mayday snapshot
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const target = searchParams.get("target") === "user" ? "user" : "memory";
    const entries = await readMemory(target);
    return NextResponse.json({ entries });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/hermes/memory — action: import (read-only pull) | append
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    if (body.action === "import") {
      const ok = await importFromHermes();
      return NextResponse.json({ ok });
    }
    if (body.action === "append") {
      const ok = await appendEntry(body.target === "user" ? "user" : "memory", body.text);
      return NextResponse.json({ ok });
    }
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}