import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "../../scripts/testDb";

// End-to-end through the real Hono app (every middleware, the real handlers) against an in-memory
// SQLite built from the committed migrations. Only makeDb is replaced, so the Worker's own D1
// binding is never touched. Covers what the unit tests cannot: that POST /register really answers
// 429 with the plain message at the cap, that /status and /tour are reachable logged out, and that
// the throttle is absent when the var is.
vi.mock("../db/client", async (orig) => {
  const actual = await orig<typeof import("../db/client")>();
  return { ...actual, makeDb: () => (globalThis as any).__throttleTestDb };
});
import app from "../index";

function register(n: number, env: Record<string, string>, headers: Record<string, string> = {}) {
  const body = new URLSearchParams({ name: `user_${n}`, email: `u${n}@t.test`, password: "longenough1", minimumAge: "on" });
  return app.fetch(
    new Request("https://t.test/register", { method: "POST", body, headers: { "Content-Type": "application/x-www-form-urlencoded", "CF-Connecting-IP": `10.0.0.${n}`, ...headers } }),
    { DB: {}, ADMIN_DEBUG: "false", ...env } as any
  );
}
const get = (path: string, env: Record<string, string> = {}) => app.fetch(new Request(`https://t.test${path}`), { DB: {}, ADMIN_DEBUG: "false", ...env } as any);

beforeEach(() => {
  (globalThis as any).__throttleTestDb = createTestDb();
});

describe("registration throttle, end to end", () => {
  it("lets sign-ups through below the cap, then answers 429 with the plain message and a Retry-After", async () => {
    const env = { REGISTRATION_HOURLY_CAP: "2" };
    expect((await register(1, env)).status).toBe(302);
    expect((await register(2, env)).status).toBe(302);
    const refused = await register(3, env);
    expect(refused.status).toBe(429);
    const text = await refused.text();
    expect(text).toContain("Many people are joining right now");
    expect(text).toContain("nothing is lost and no one is turned away permanently");
    expect(Number(refused.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(refused.headers.get("Set-Cookie")).toBeNull();
  }, 30000);

  it("a refused attempt adds nothing to the count, so it cannot prolong the pause", async () => {
    const env = { REGISTRATION_HOURLY_CAP: "1" };
    expect((await register(1, env)).status).toBe(302);
    for (let i = 2; i < 6; i++) expect((await register(i, env)).status).toBe(429);
    const status = await (await get("/status", env)).text();
    expect(status).toContain(">1<"); // one joined in the last hour, not five
  }, 30000);

  it("cap unset: no throttle at all", async () => {
    for (let i = 1; i <= 4; i++) expect((await register(i, {})).status).toBe(302);
  }, 30000);

  it("cap 0 or junk also means no throttle", async () => {
    expect((await register(1, { REGISTRATION_HOURLY_CAP: "0" })).status).toBe(302);
    expect((await register(2, { REGISTRATION_HOURLY_CAP: "lots" })).status).toBe(302);
    expect((await register(3, { REGISTRATION_HOURLY_CAP: "0" })).status).toBe(302);
  }, 30000);

  it("GET /status is public and reports open, then briefly paused, with the cap and the count", async () => {
    const env = { REGISTRATION_HOURLY_CAP: "1" };
    const open = await get("/status", env);
    expect(open.status).toBe(200);
    const openText = await open.text();
    expect(openText).toContain(">Open<");
    expect(openText).toContain(">1<"); // the cap
    await register(1, env);
    const paused = await (await get("/status", env)).text();
    expect(paused).toContain("Briefly paused");
    expect(paused).toContain("no one is turned away permanently");
  }, 30000);

  it("GET /status with no cap set says none", async () => {
    const text = await (await get("/status")).text();
    expect(text).toContain(">None<");
    expect(text).toContain(">Open<");
  }, 30000);

  it("GET /tour is public (no redirect to /login) and offers one way to join", async () => {
    const res = await get("/tour");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Look around before you join");
    expect(html.match(/href="\/register"/g)).toHaveLength(1);
  }, 30000);

  it("the member-only pages the tour does not link are still behind login", async () => {
    for (const p of ["/delegation", "/contribution"]) {
      const res = await get(p);
      expect(res.status, p).toBe(302);
      expect(res.headers.get("Location")).toBe("/login");
    }
  }, 30000);
});
