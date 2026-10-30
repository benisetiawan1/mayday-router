import { NextResponse } from "next/server";
import { requireDashboardAuth } from "@/lib/auth/routeAuth.js";
import {
  listAccounts,
  maskToken,
  syncAccount,
  syncAll,
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

// GET /api/proxy-pools/webshare-sync — accounts + summary (tokens masked)
export async function GET(request) {
  if (!await authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const accounts = await listAccounts();
    return NextResponse.json({ accounts: accounts.map(maskAccount) });
  } catch (error) {
    console.log("Error listing webshare accounts:", error);
    return NextResponse.json({ error: "Failed to list accounts" }, { status: 500 });
  }
}

// POST /api/proxy-pools/webshare-sync — body { accountId? } triggers sync (one or all)
export async function POST(request) {
  if (!await authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json().catch(() => ({}));
    const accountId = typeof body?.accountId === "string" && body.accountId ? body.accountId : null;

    if (!accountId) {
      const results = await syncAll();
      return NextResponse.json({ results });
    }

    const accounts = await listAccounts();
    const account = accounts.find((a) => a.id === accountId);
    if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });

    const result = await syncAccount(account);
    return NextResponse.json({ result });
  } catch (error) {
    console.log("Error syncing webshare:", error);
    return NextResponse.json({ error: "Failed to sync webshare" }, { status: 500 });
  }
}