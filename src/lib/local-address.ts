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
