import { describe, it, expect, afterEach } from "vitest";
import { Hono } from "hono";
import type { Env } from "../types";
import { publicCacheTtl, hasSessionCookie, publicPageCache } from "./publicCache";

const COOKIE = "triarc_session";

function fakeCache(opts: { failMatch?: boolean; failPut?: boolean } = {}) {
  const store = new Map<string, Response>();
  return {
    store,
    async match(req: Request) {
      if (opts.failMatch) throw new Error("cache down");
      return store.get(req.url)?.clone();
    },
    async put(req: Request, res: Response) {
      if (opts.failPut) throw new Error("cache full");
      store.set(req.url, res);
    },
  };
}
function installCache(c: ReturnType<typeof fakeCache> | undefined) {
  (globalThis as any).caches = c ? { default: c } : undefined;
}
afterEach(() => {
  delete (globalThis as any).caches;
});

/** A tiny app standing in for the real one: counts how often each handler really runs. */
function makeApp() {
  const calls: Record<string, number> = {};
  const hit = (k: string) => (calls[k] = (calls[k] ?? 0) + 1);
  const app = new Hono<Env>();
  app.use("*", publicPageCache(COOKIE));
  app.get("/record", (c) => (hit("record"), c.html(`<p>record ${calls.record}</p>`)));
  app.get("/status", (c) => (hit("status"), c.html(`<p>status ${calls.status}</p>`)));
  app.get("/documents", (c) => (hit("documents"), c.html(`<p>docs ${c.req.query("q") ?? ""} ${calls.documents}</p>`)));
  app.get("/dashboard", (c) => (hit("dashboard"), c.html(`<p>dash ${calls.dashboard}</p>`)));
  app.get("/tour", (c) => (hit("tour"), c.html("<p>tour</p>", 404)));
  app.get("/governance-health", (c) => {
    hit("gh");
    c.header("Set-Cookie", "x=1");
    return c.html("<p>gh</p>");
  });
  app.post("/record", (c) => (hit("postrecord"), c.html("<p>posted</p>")));
  return { app, calls };
}

describe("publicCacheTtl", () => {
  it("lists exactly the intended public pages", () => {
    for (const p of ["/", "/documents", "/documents/defaults", "/documents/charter", "/documents/rules-of-procedure", "/record", "/governance-health", "/status", "/tour"]) {
      expect(publicCacheTtl("GET", p), p).not.toBeNull();
    }
  });
  it("keeps TTLs short: 30 s at most for /status, 120 s at most elsewhere", () => {
    expect(publicCacheTtl("GET", "/status")!).toBeLessThanOrEqual(30);
    for (const p of ["/", "/documents", "/documents/charter", "/documents/defaults", "/record", "/governance-health", "/tour"]) {
      expect(publicCacheTtl("GET", p)!, p).toBeLessThanOrEqual(120);
      expect(publicCacheTtl("GET", p)!, p).toBeGreaterThanOrEqual(60);
    }
  });
  it("never caches anything else: other methods, member pages, other public pages, odd slugs", () => {
    expect(publicCacheTtl("POST", "/record")).toBeNull();
    expect(publicCacheTtl("HEAD", "/record")).toBeNull();
    for (const p of ["/dashboard", "/proposals", "/proposals/1", "/treasury", "/disputes", "/directory", "/login", "/register", "/logout", "/delegation", "/contribution", "/profile/1", "/notifications/inbox", "/admin/advance", "/documents/", "/documents/a/b", "/documents/Charter", "/record/", "/statuses"]) {
      expect(publicCacheTtl("GET", p), p).toBeNull();
    }
  });
});

describe("hasSessionCookie", () => {
  it("matches by cookie name only", () => {
    expect(hasSessionCookie(`${COOKIE}=abc`, COOKIE)).toBe(true);
    expect(hasSessionCookie(`a=1; ${COOKIE}=abc; b=2`, COOKIE)).toBe(true);
    expect(hasSessionCookie(undefined, COOKIE)).toBe(false);
    expect(hasSessionCookie("", COOKIE)).toBe(false);
    expect(hasSessionCookie(`x_${COOKIE}=1; other=2`, COOKIE)).toBe(false);
  });
});

describe("publicPageCache", () => {
  it("serves the second anonymous request from cache without running the handler", async () => {
    const cache = fakeCache();
    installCache(cache);
    const { app, calls } = makeApp();
    const first = await app.request("https://t.test/record");
    expect(first.status).toBe(200);
    expect(first.headers.get("X-Edge-Cache")).toBe("MISS");
    expect(await first.text()).toBe("<p>record 1</p>");
    const second = await app.request("https://t.test/record");
    expect(second.headers.get("X-Edge-Cache")).toBe("HIT");
    expect(await second.text()).toBe("<p>record 1</p>");
    expect(calls.record).toBe(1);
  });

  it("stores the page with a short public TTL but never sends Cache-Control to the browser", async () => {
    const cache = fakeCache();
    installCache(cache);
    const { app } = makeApp();
    const first = await app.request("https://t.test/status");
    expect(first.headers.get("Cache-Control")).toBeNull();
    expect(cache.store.get("https://t.test/status")!.headers.get("Cache-Control")).toBe("public, max-age=30");
    const second = await app.request("https://t.test/status");
    expect(second.headers.get("Cache-Control")).toBeNull();
  });

  it("never reads or stores for a request with a session cookie", async () => {
    const cache = fakeCache();
    installCache(cache);
    const { app, calls } = makeApp();
    // Warm the cache anonymously, then show a signed-in request does not get that copy.
    await app.request("https://t.test/record");
    const signedIn = await app.request("https://t.test/record", { headers: { Cookie: `${COOKIE}=abc` } });
    expect(await signedIn.text()).toBe("<p>record 2</p>");
    expect(signedIn.headers.get("X-Edge-Cache")).toBeNull();
    expect(calls.record).toBe(2);
    // And with a cold cache a signed-in request leaves nothing behind.
    cache.store.clear();
    await app.request("https://t.test/record", { headers: { Cookie: `${COOKIE}=abc` } });
    expect(cache.store.size).toBe(0);
  });

  it("never caches a POST or a path outside the allow-list", async () => {
    const cache = fakeCache();
    installCache(cache);
    const { app, calls } = makeApp();
    await app.request("https://t.test/record", { method: "POST" });
    await app.request("https://t.test/record", { method: "POST" });
    expect(calls.postrecord).toBe(2);
    await app.request("https://t.test/dashboard");
    await app.request("https://t.test/dashboard");
    expect(calls.dashboard).toBe(2);
    expect(cache.store.size).toBe(0);
  });

  it("never caches a non-200 or a response that sets a cookie", async () => {
    const cache = fakeCache();
    installCache(cache);
    const { app, calls } = makeApp();
    await app.request("https://t.test/tour");
    await app.request("https://t.test/tour");
    expect(calls.tour).toBe(2);
    await app.request("https://t.test/governance-health");
    await app.request("https://t.test/governance-health");
    expect(calls.gh).toBe(2);
    expect(cache.store.size).toBe(0);
  });

  it("keys by the full URL, query string included", async () => {
    installCache(fakeCache());
    const { app, calls } = makeApp();
    const a = await (await app.request("https://t.test/documents?q=alpha")).text();
    const b = await (await app.request("https://t.test/documents?q=beta")).text();
    expect(a).toContain("alpha");
    expect(b).toContain("beta");
    await app.request("https://t.test/documents?q=alpha");
    expect(calls.documents).toBe(2);
  });

  it("does not cache an absurdly long query string", async () => {
    const cache = fakeCache();
    installCache(cache);
    const { app, calls } = makeApp();
    const url = `https://t.test/documents?q=${"x".repeat(300)}`;
    await app.request(url);
    await app.request(url);
    expect(calls.documents).toBe(2);
    expect(cache.store.size).toBe(0);
  });

  it("fails open when the cache lookup throws", async () => {
    installCache(fakeCache({ failMatch: true }));
    const { app } = makeApp();
    const res = await app.request("https://t.test/record");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("<p>record 1</p>");
  });

  it("fails open when storing throws", async () => {
    installCache(fakeCache({ failPut: true }));
    const { app } = makeApp();
    const res = await app.request("https://t.test/record");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("<p>record 1</p>");
  });

  it("is a no-op when there is no Cache API (tests, local)", async () => {
    installCache(undefined);
    const { app, calls } = makeApp();
    await app.request("https://t.test/record");
    const res = await app.request("https://t.test/record");
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Edge-Cache")).toBeNull();
    expect(calls.record).toBe(2);
  });

  it("is skipped when ADMIN_DEBUG is on", async () => {
    const cache = fakeCache();
    installCache(cache);
    const { app, calls } = makeApp();
    const env = { ADMIN_DEBUG: "true" } as any;
    await app.request("https://t.test/record", {}, env);
    await app.request("https://t.test/record", {}, env);
    expect(calls.record).toBe(2);
    expect(cache.store.size).toBe(0);
  });
});
