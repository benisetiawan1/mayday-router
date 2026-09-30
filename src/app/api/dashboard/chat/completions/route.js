import { handleChat } from "@/sse/handlers/chat.js";
import { initTranslators } from "open-sse/translator/index.js";
import { getConsistentMachineId } from "@/shared/utils/machineId.js";

// Dashboard-internal chat endpoint for /dashboard/basic-chat.
// Auth: dashboard session JWT, enforced by dashboardGuard's deny-by-default
// /api/* gate. The request is re-signed server-side with the machine-bound
// internal CLI token so handleChat treats it as trusted-internal (the same
// path local CLI tooling uses) instead of requiring a public API key.

let initialized = false;

async function ensureInitialized() {
  if (!initialized) {
    await initTranslators();
    initialized = true;
  }
}

export async function POST(request) {
  await ensureInitialized();
  const body = await request.text();
  const headers = new Headers(request.headers);
  headers.set("x-9r-cli-token", await getConsistentMachineId("9r-cli-auth"));
  const trustedRequest = new Request(request.url, {
    method: "POST",
    headers,
    body,
  });
  return handleChat(trustedRequest);
}
