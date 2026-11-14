import "server-only";
import { headers } from "next/headers";

/**
 * The app's address for links it hands out (the TV address): APP_URL when set, else the address
 * this request came in on.
 */
export async function appBase(): Promise<string> {
  const env = process.env.APP_URL?.trim().replace(/\/$/, "");
  if (env) return env;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  if (!host) return "";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}
