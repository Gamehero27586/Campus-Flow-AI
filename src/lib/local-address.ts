/**
 * Is this URL an address that only this computer can reach? Compared on the exact host name, so a
 * look-alike such as http://localhost.example.com does not count.
 */
export function isLocalAddress(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
  } catch {
    return false;
  }
}

/**
 * Is this the origin of a computer on a home or office network: http, a private IPv4 address (10.x.x.x,
 * 172.16-31.x.x or 192.168.x.x) and nothing else (no path, no user name, no domain name)? Used only for
 * trying the app on a phone over Wi-Fi in development (DEV_ALLOW_LAN). A domain name, a tunnel address or a
 * public IP never counts, so this cannot be used to open the app to the internet.
 */
export function isPrivateLanOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:") return false;
    if (url.username || url.password || url.search || url.hash) return false;
    if (url.pathname !== "/" || value.replace(/\/+$/, "") !== url.origin) return false;
    const parts = url.hostname.split(".");
    if (parts.length !== 4 || !parts.every((part) => /^(0|[1-9]\d{0,2})$/.test(part))) return false;
    const [a, b] = parts.map(Number);
    if (parts.some((part) => Number(part) > 255)) return false;
    return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  } catch {
    return false;
  }
}
