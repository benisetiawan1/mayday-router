import { NextResponse } from "next/server";
import { requireDashboardAuth } from "@/lib/auth/routeAuth.js";
import {
  createAccount,
  deleteAccount,
  getAccount,
  maskToken,
  updateAccount,
} from "@/shared/services/webshareSync";

async function authorized(request) {
  return requireDashboardAuth(request);
}

function maskAccount(account) {
  return {
    id: account.id,
    name: account.name,
    tokenMasked: maskToken(account.token),
    mode: account.mode,
    countryCodeIn: account.countryCodeIn || null,
    isActive: account.isActive !== false,
    createdAt: account.createdAt || null,
    lastSyncAt: account.lastSyncAt || null,
    lastStatus: account.lastStatus || "never",
    lastError: account.lastError || null,
    lastCount: account.lastCount ?? null,
  };
}

// POST /api/proxy-pools/webshare-sync/accounts — create { name?, token, mode?, countryCodeIn? }
export async function POST(request) {
  if (!await authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    const token = typeof body?.token === "string" ? body.token.trim() : "";
    if (!token) return NextResponse.json({ error: "Token is required" }, { status: 400 });

    const account = await createAccount({
      name: body?.name,
      token,
      mode: body?.mode === "backbone" ? "backbone" : "direct",
      countryCodeIn: body?.countryCodeIn,
    });
    return NextResponse.json({ account: maskAccount(account) }, { status: 201 });
  } catch (error) {
    console.log("Error creating webshare account:", error);
    return NextResponse.json({ error: "Failed to create account" }, { status: 500 });
  }
}

// PATCH /api/proxy-pools/webshare-sync/accounts — toggle { id, isActive? }
export async function PATCH(request) {
  if (!await authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    const id = typeof body?.id === "string" ? body.id.trim() : "";
    if (!id) return NextResponse.json({ error: "Account id is required" }, { status: 400 });

    const existing = await getAccount(id);
    if (!existing) return NextResponse.json({ error: "Account not found" }, { status: 404 });

    const patch = {};
    if (body.isActive !== undefined) patch.isActive = body.isActive === true;

    const account = await updateAccount(id, patch);
    return NextResponse.json({ account: maskAccount(account) });
  } catch (error) {
    console.log("Error updating webshare account:", error);
    return NextResponse.json({ error: "Failed to update account" }, { status: 500 });
  }
}

// DELETE /api/proxy-pools/webshare-sync/accounts?id=...
export async function DELETE(request) {
  if (!await authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Account id is required" }, { status: 400 });

    const removed = await deleteAccount(id);
    if (!removed) return NextResponse.json({ error: "Account not found" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.log("Error deleting webshare account:", error);
    return NextResponse.json({ error: "Failed to delete account" }, { status: 500 });
  }
}