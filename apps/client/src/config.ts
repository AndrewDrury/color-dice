/** Server origin. Set `VITE_SERVER_URL` at build time for production. */
export const SERVER_URL: string = stripTrailingSlash(
  import.meta.env.VITE_SERVER_URL ?? "http://localhost:8787",
);

/** WebSocket origin derived from `SERVER_URL` (http → ws, https → wss). */
export const WS_URL: string = toWsUrl(SERVER_URL);

export function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

export function toWsUrl(httpUrl: string): string {
  if (httpUrl.startsWith("https://")) return `wss://${httpUrl.slice("https://".length)}`;
  if (httpUrl.startsWith("http://")) return `ws://${httpUrl.slice("http://".length)}`;
  return httpUrl;
}
