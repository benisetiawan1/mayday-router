/**
 * Antigravity header scrubbing.
 *
 * Real Antigravity is a Node.js app. Its outbound HTTP requests never include
 * proxy tracing headers, Stainless SDK headers, or Chromium Sec-Ch-* headers.
 * Sending any of these reveals the request came through a third-party proxy.
 * Based on CLIProxyAPI's ScrubProxyAndFingerprintHeaders.
 */

const HEADERS_TO_REMOVE = [
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-forwarded-port",
  "x-real-ip",
  "forwarded",
  "via",
  "x-title",
  "x-stainless-lang",
  "x-stainless-package-version",
  "x-stainless-os",
  "x-stainless-arch",
  "x-stainless-runtime",
  "x-stainless-runtime-version",
  "x-stainless-timeout",
  "x-stainless-retry-count",
  "x-stainless-helper-method",
  "http-referer",
  "referer",
  "sec-ch-ua",
  "sec-ch-ua-mobile",
  "sec-ch-ua-platform",
  "sec-fetch-mode",
  "sec-fetch-site",
  "sec-fetch-dest",
  "priority",
  "accept-encoding",
];

export function scrubProxyAndFingerprintHeaders(headers) {
  const cleaned = {};
  let authorizationValue;
  for (const [key, value] of Object.entries(headers || {})) {
    const lowerKey = key.toLowerCase();
    if (lowerKey.startsWith("x-omniroute-") || lowerKey.startsWith("x-9router-") || HEADERS_TO_REMOVE.includes(lowerKey)) {
      continue;
    }
    if (lowerKey === "authorization") {
      authorizationValue = value;
      continue;
    }
    cleaned[key] = value;
  }
  cleaned["Accept-Encoding"] = "gzip, deflate, br";
  if (authorizationValue !== undefined) {
    cleaned["Authorization"] = authorizationValue;
  }
  return cleaned;
}
