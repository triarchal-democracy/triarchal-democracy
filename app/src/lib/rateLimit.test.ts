import { describe, it, expect } from "vitest";
import { createTestDb } from "../../scripts/testDb";
import { ensureCommunity, logSecurityEvent } from "./community";
import { loginAttempts } from "../db/schema";
import { burstAllowed, registrationCapReached, failedLoginCapReached, parseRegistrationHourlyCap, registrationThrottle, throttleMinutes, throttleMessage, REGISTER_EVENT_KIND, REGISTRATIONS_PER_IP_PER_HOUR, FAILED_LOGINS_PER_IP_PER_WINDOW } from "./rateLimit";

const NOW = Date.now();
const WINDOW = 15 * 60 * 1000;

describe("burstAllowed", () => {
  it("allows when there is no binding (local dev, tests)", async () => {
    expect(await burstAllowed(undefined, "1.2.3.4")).toBe(true);
  });
  it("follows the binding's verdict", async () => {
    expect(await burstAllowed({ limit: async () => ({ success: true }) }, "k")).toBe(true);
    expect(await burstAllowed({ limit: async () => ({ success: false }) }, "k")).toBe(false);
  });
  it("fails open when the binding throws", async () => {
    expect(await burstAllowed({ limit: async () => { throw new Error("down"); } }, "k")).toBe(true);
  });
});

describe("registration cap per network", () => {
  it("trips at the hourly cap for that IP only, and ages out after an hour", async () => {
    const db = createTestDb();
    const community = await ensureCommunity(db);
    for (let i = 0; i < REGISTRATIONS_PER_IP_PER_HOUR; i++) {
      await logSecurityEvent(db, community.id, REGISTER_EVENT_KIND, null, "9.9.9.9", null, null, NOW - 60_000);
    }
    expect(await registrationCapReached(db, community.id, "9.9.9.9", NOW)).toBe(true);
    expect(await registrationCapReached(db, community.id, "8.8.8.8", NOW)).toBe(false);
    expect(await registrationCapReached(db, community.id, "9.9.9.9", NOW + 2 * 60 * 60 * 1000)).toBe(false);
  });
  it("one short of the cap is still allowed", async () => {
    const db = createTestDb();
    const community = await ensureCommunity(db);
    for (let i = 0; i < REGISTRATIONS_PER_IP_PER_HOUR - 1; i++) {
      await logSecurityEvent(db, community.id, REGISTER_EVENT_KIND, null, "9.9.9.9", null, null, NOW);
    }
    expect(await registrationCapReached(db, community.id, "9.9.9.9", NOW)).toBe(false);
  });
  it("never limits an unknown IP (local dev has no edge header)", async () => {
    const db = createTestDb();
    const community = await ensureCommunity(db);
    for (let i = 0; i < REGISTRATIONS_PER_IP_PER_HOUR + 5; i++) {
      await logSecurityEvent(db, community.id, REGISTER_EVENT_KIND, null, "unknown", null, null, NOW);
    }
    expect(await registrationCapReached(db, community.id, "unknown", NOW)).toBe(false);
  });
});

describe("failed-login cap per network", () => {
  it("counts failures across many emails from one IP, ignores successes, and ages out", async () => {
    const db = createTestDb();
    const community = await ensureCommunity(db);
    for (let i = 0; i < FAILED_LOGINS_PER_IP_PER_WINDOW; i++) {
      await db.insert(loginAttempts).values({ communityId: community.id, email: `v${i}@t.test`, ip: "7.7.7.7", success: 0, attemptedAt: NOW - 1000 });
    }
    await db.insert(loginAttempts).values({ communityId: community.id, email: "ok@t.test", ip: "6.6.6.6", success: 1, attemptedAt: NOW });
    expect(await failedLoginCapReached(db, "7.7.7.7", NOW, WINDOW)).toBe(true);
    expect(await failedLoginCapReached(db, "6.6.6.6", NOW, WINDOW)).toBe(false);
    expect(await failedLoginCapReached(db, "7.7.7.7", NOW + WINDOW + 5000, WINDOW)).toBe(false);
  });
});

const HOUR = 60 * 60 * 1000;
const MIN = 60 * 1000;

describe("parseRegistrationHourlyCap", () => {
  it("reads a positive number", () => {
    expect(parseRegistrationHourlyCap("200")).toBe(200);
    expect(parseRegistrationHourlyCap(" 50 ")).toBe(50);
    expect(parseRegistrationHourlyCap("12.9")).toBe(12);
  });
  it("treats unset, empty, zero, negative and junk as no throttle", () => {
    for (const raw of [undefined, null, "", "  ", "0", "-5", "abc", "NaN", "Infinity"]) {
      expect(parseRegistrationHourlyCap(raw as string | undefined), String(raw)).toBe(0);
    }
  });
});

describe("community-wide registration throttle", () => {
  const seed = async (db: ReturnType<typeof createTestDb>, communityId: number, times: number[], ip = "unknown") => {
    for (const t of times) await logSecurityEvent(db, communityId, REGISTER_EVENT_KIND, null, ip, null, null, t);
  };

  it("below the cap: not throttled, and reports the count", async () => {
    const db = createTestDb();
    const community = await ensureCommunity(db);
    await seed(db, community.id, [NOW - 5 * MIN, NOW - 4 * MIN, NOW - 3 * MIN]);
    expect(await registrationThrottle(db, community.id, 4, NOW)).toEqual({ cap: 4, recent: 3, throttled: false, retryAfterMs: 0 });
  });

  it("at the cap: throttled, and the wait is until the oldest registration ages out", async () => {
    const db = createTestDb();
    const community = await ensureCommunity(db);
    await seed(db, community.id, [NOW - 50 * MIN, NOW - 20 * MIN, NOW - 10 * MIN]);
    const t = await registrationThrottle(db, community.id, 3, NOW);
    expect(t.throttled).toBe(true);
    expect(t.recent).toBe(3);
    expect(t.retryAfterMs).toBe(10 * MIN); // the 50-minute-old one leaves the window in 10 minutes
    expect(throttleMinutes(t.retryAfterMs)).toBe(10);
  });

  it("counts every network together, unlike the per-IP cap, and ignores other kinds", async () => {
    const db = createTestDb();
    const community = await ensureCommunity(db);
    await seed(db, community.id, [NOW - MIN], "1.1.1.1");
    await seed(db, community.id, [NOW - MIN], "2.2.2.2");
    await seed(db, community.id, [NOW - MIN], "unknown");
    await logSecurityEvent(db, community.id, "login_success", null, "3.3.3.3", null, null, NOW - MIN);
    const t = await registrationThrottle(db, community.id, 3, NOW);
    expect(t.recent).toBe(3);
    expect(t.throttled).toBe(true);
  });

  it("ages out: the same rows stop counting an hour later, and throttling lifts on its own", async () => {
    const db = createTestDb();
    const community = await ensureCommunity(db);
    await seed(db, community.id, [NOW - 30 * MIN, NOW - 29 * MIN]);
    expect((await registrationThrottle(db, community.id, 2, NOW)).throttled).toBe(true);
    // 30.5 minutes later the first has aged out (it is 60.5 minutes old) and the second has not (59.5), so one slot is free.
    const later = await registrationThrottle(db, community.id, 2, NOW + 30 * MIN + 30_000);
    expect(later.recent).toBe(1);
    expect(later.throttled).toBe(false);
    // An hour after that, nothing counts at all.
    expect((await registrationThrottle(db, community.id, 2, NOW + 2 * HOUR)).recent).toBe(0);
  });

  it("a registration exactly an hour old no longer counts", async () => {
    const db = createTestDb();
    const community = await ensureCommunity(db);
    await seed(db, community.id, [NOW - HOUR]);
    expect((await registrationThrottle(db, community.id, 1, NOW)).recent).toBe(0);
  });

  it("if the cap was lowered below the current count, waits for enough to age out, not just the oldest", async () => {
    const db = createTestDb();
    const community = await ensureCommunity(db);
    // Five in the window, cap now 3: it takes the 3rd-oldest (index recent-cap = 2) leaving to get back under.
    await seed(db, community.id, [NOW - 55 * MIN, NOW - 40 * MIN, NOW - 30 * MIN, NOW - 20 * MIN, NOW - 10 * MIN]);
    const t = await registrationThrottle(db, community.id, 3, NOW);
    expect(t.throttled).toBe(true);
    expect(t.retryAfterMs).toBe(30 * MIN);
  });

  it("cap unset (0): never throttled however many register, but still reports the count", async () => {
    const db = createTestDb();
    const community = await ensureCommunity(db);
    await seed(db, community.id, Array.from({ length: 500 }, () => NOW - MIN));
    expect(await registrationThrottle(db, community.id, 0, NOW)).toEqual({ cap: 0, recent: 500, throttled: false, retryAfterMs: 0 });
  });

  it("only counts the asked-about community", async () => {
    const db = createTestDb();
    const community = await ensureCommunity(db);
    await seed(db, community.id, [NOW - MIN, NOW - MIN]);
    expect((await registrationThrottle(db, community.id + 1, 1, NOW)).recent).toBe(0);
  });
});

describe("throttleMessage", () => {
  it("is plain, states roughly how long, and promises no permanent exclusion", () => {
    const m = throttleMessage(7 * MIN + 1);
    expect(m).toContain("about 8 minutes");
    expect(m).toContain("nothing is lost and no one is turned away permanently");
    expect(throttleMessage(30_000)).toContain("about 1 minute;");
  });
  it("uses no urgency or scarcity language (Rules of Procedure 4.3)", () => {
    expect(throttleMessage(5 * MIN)).not.toMatch(/hurry|quick|last chance|spots? (left|remaining)|limited|countdown|now or never/i);
  });
});
