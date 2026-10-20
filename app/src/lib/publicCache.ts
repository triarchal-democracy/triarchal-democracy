// In-Worker page cache for anonymous visitors to a short allow-list of public pages
// (launch-readiness: cut D1 reads and CPU when a link spikes).
//
// HONEST LIMITS - read before relying on this:
//   * It reduces D1 reads and CPU. It does NOT reduce the request count. On workers.dev the Worker
//     still runs for every request, and each invocation counts toward the plan's daily request cap
//     (free plan: 100,000/day). The paid Workers plan is the real fix for that cap, and the static
//     site on Vercel, which sits behind a CDN, is the better front door for a traffic spike.
//   * It may do nothing at all on workers.dev. Cloudflare's Cache API is documented as working for
//     Workers on custom domains, and a Cloudflare engineer has said on the community forum that it
//     is not enabled on workers.dev. The code is harmless either way (a missed lookup is just a
//     normal render), and starts paying the moment the app is served from a custom domain. After a
//     deploy, request a listed page twice and look for the X-Edge-Cache header: HIT on the second
//     means it is working; MISS both times means it is not (expected on workers.dev).
//   * The Cache API is per data centre, so each location warms its own copy.
//
// Safety rules, all enforced here and tested in publicCache.test.ts:
//   * GET only, and only paths in publicCacheTtl() below (every one is also public in
//     isPublicRequest, which a test asserts).
//   * Never a request that carries the session cookie, so no signed-in page is ever stored or
//     served to a stranger, and a signed-in Member always sees their own header and state.
//   * Never a response that is not 200, or that sets a cookie.
//   * Keyed by the full URL (query string included), so /documents?q=a and /documents?q=b are
//     separate entries. Very long query strings are not cached.
//   * Fails open: any error from the cache (lookup or store) falls through to a normal render. If
//     `caches` does not exist (tests, some local runs) the middleware does nothing.
//   * Skipped when ADMIN_DEBUG is "true" (the debug clock changes what pages show).
//   * Browsers are NOT told to cache (no Cache-Control reaches the client), so a visitor who signs
//     in and returns to "/" is never shown a stale guest page from their own browser.
//
// Registered before the bootstrap middleware, so a hit also skips ensureCommunity and tick(). Time
// based upkeep still runs on every miss, every signed-in request and the daily cron, and a page
// is at most TTL seconds old, so this only delays *display* by up to the TTL.
import type { MiddlewareHandler } from "hono";
import type { Env } from "../types";

const EXACT_TTL_SECONDS = new Map<string, number>([
  ["/", 120], // the institutional landing page when INSTITUTIONAL_LANDING is "true"; a guest redirect elsewhere (a 302, never stored)
  ["/documents", 120],
  ["/documents/defaults", 120],
  ["/record", 60],
  ["/governance-health", 60],
  ["/tour", 120],
  ["/status", 30], // sign-up status: the freshest of the set
]);
const DOCUMENT_SLUG_RE = /^\/documents\/[a-z0-9-]+$/;
const MAX_QUERY_LENGTH = 120;

/** Seconds a response for this request may be served from cache, or null when it must never be cached. */
export function publicCacheTtl(method: string, path: string): number | null {
  if (method !== "GET") return null;
  const exact = EXACT_TTL_SECONDS.get(path);
  if (exact !== undefined) return exact;
  if (DOCUMENT_SLUG_RE.test(path)) return 120;
  return null;
}

/** True when the Cookie header carries the session cookie (by name, not value). */
export function hasSessionCookie(cookieHeader: string | undefined | null, name: string): boolean {
  if (!cookieHeader) return false;
  return cookieHeader.split(";").some((part) => part.trim().startsWith(`${name}=`) || part.trim() === name);
}

function edgeCache(): Cache | undefined {
  try {
    return typeof caches !== "undefined" ? (caches as unknown as { default?: Cache }).default : undefined;
  } catch {
    return undefined;
  }
}

export function publicPageCache(sessionCookieName: string): MiddlewareHandler<Env> {
  return async (c, next) => {
    const ttl = publicCacheTtl(c.req.method, c.req.path);
    if (ttl === null || hasSessionCookie(c.req.header("Cookie"), sessionCookieName) || c.env?.ADMIN_DEBUG === "true") return next();
    const cache = edgeCache();
    if (!cache) return next();

    let key: Request;
    try {
      const url = new URL(c.req.url);
      if (url.search.length > MAX_QUERY_LENGTH) return next();
      key = new Request(url.toString(), { method: "GET" });
      const hit = await cache.match(key);
      if (hit) {
        const headers = new Headers(hit.headers);
        headers.delete("Cache-Control"); // browsers are never told to keep a page
        headers.set("X-Edge-Cache", "HIT");
        return new Response(hit.body, { status: hit.status, headers });
      }
    } catch {
      return next(); // fail open
    }

    await next();

    try {
      const res = c.res;
      const type = res.headers.get("Content-Type") ?? "";
      if (res.status === 200 && !res.headers.has("Set-Cookie") && type.startsWith("text/html")) {
        const stored = new Response(res.clone().body, res);
        stored.headers.set("Cache-Control", `public, max-age=${ttl}`);
        const put = cache.put(key, stored).catch(() => {});
        try {
          c.executionCtx.waitUntil(put);
        } catch {
          await put; // no execution context (tests): just wait for it
        }
        c.header("X-Edge-Cache", "MISS");
      }
    } catch {
      // fail open: the response already in c.res goes out untouched
    }
  };
}
