export function hasTrustedPeerHeaders(request) {
  const expected = process.env.NINEROUTER_PEER_TOKEN;
  return Boolean(expected && request.headers.get("x-9r-peer-token") === expected);
}
