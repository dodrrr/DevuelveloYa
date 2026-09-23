import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { request } from "node:https";

/** Deny non-public destinations, including IPv4-mapped IPv6. HTTPS requests pin the
 * validated address, preventing a second DNS lookup/rebinding between validation and I/O. */
export function isPublicAddress(address: string): boolean {
  const ip = address.toLowerCase().replace(/^\[|\]$/g, "");
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 0 || b === 168)) ||
      (a === 198 && (b === 18 || b === 19 || b === 51)) ||
      (a === 203 && b === 0)
    );
  }
  if (isIP(ip) === 6) {
    // Global unicast only. Denies mapped IPv4, loopback, multicast, link-local,
    // unique-local and transition/tunnel ranges that can conceal private addresses.
    const parts = ip.split(":");
    const first = parseInt(parts[0], 16);
    const second = parseInt(parts[1] || "0", 16);
    return (
      first >= 0x2000 &&
      first <= 0x3fff &&
      first !== 0x2002 &&
      first !== 0x3fff &&
      !(first === 0x2001 && (second <= 0x01ff || second === 0x0db8))
    );
  }
  return false;
}
export function trustedUrl(value: string, allowedHosts: string[]): URL {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443") ||
    !allowedHosts.includes(url.hostname.toLowerCase()) ||
    isIP(url.hostname.replace(/^\[|\]$/g, ""))
  )
    throw new Error("Destino no permitido");
  return url;
}
export interface SafeResponse {
  status: number;
  url: string;
  body: string;
  contentType: string;
}
export async function safePublicGet(
  value: string,
  hosts: string[],
  maxBytes = 256_000,
): Promise<SafeResponse> {
  let current = value;
  for (let redirect = 0; redirect < 4; redirect++) {
    const url = trustedUrl(current, hosts);
    const addresses = await lookup(url.hostname, { all: true, verbatim: true });
    if (!addresses.length || addresses.some((a) => !isPublicAddress(a.address)))
      throw new Error("Dirección de red no permitida");
    const pinned = addresses[0];
    const result = await new Promise<SafeResponse & { location?: string }>(
      (resolve, reject) => {
        const req = request(
          url,
          {
            method: "GET",
            headers: {
              "User-Agent": "DevuelveloYa/1.0 (+return-policy-check)",
              Accept: "text/html,text/plain",
              "Accept-Encoding": "identity",
            },
            lookup: ((
              _hostname: unknown,
              options: unknown,
              callback: (...args: unknown[]) => void,
            ) => {
              if ((options as { all?: boolean })?.all)
                callback(null, [
                  { address: pinned.address, family: pinned.family },
                ]);
              else callback(null, pinned.address, pinned.family);
            }) as any,
          },
          (res) => {
            const chunks: Buffer[] = [];
            let size = 0;
            res.on("data", (chunk: Buffer) => {
              size += chunk.length;
              if (size > maxBytes) {
                res.destroy();
                resolve({
                  status: res.statusCode || 0,
                  url: url.href,
                  body: Buffer.concat(chunks).toString("utf8"),
                  contentType: String(res.headers["content-type"] || ""),
                  location: res.headers.location,
                });
              } else chunks.push(chunk);
            });
            res.on("end", () =>
              resolve({
                status: res.statusCode || 0,
                url: url.href,
                body: Buffer.concat(chunks).toString("utf8"),
                contentType: String(res.headers["content-type"] || ""),
                location: res.headers.location,
              }),
            );
            res.on("error", reject);
          },
        );
        const timer = setTimeout(
          () => req.destroy(new Error("Tiempo de espera agotado")),
          9000,
        );
        req.on("close", () => clearTimeout(timer));
        req.on("error", reject);
        req.end();
      },
    );
    if ([301, 302, 303, 307, 308].includes(result.status) && result.location) {
      current = new URL(result.location, current).href;
      continue;
    }
    return result;
  }
  throw new Error("Demasiadas redirecciones");
}
