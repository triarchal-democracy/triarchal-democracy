import { describe, it, expect } from "vitest";
import { createTestDb } from "../../scripts/testDb";
import { ensureCommunity, appointModerator, closeUnderageAccount } from "./community";
import { MINIMUM_MEMBER_AGE } from "./mechanics";
import { members, record, sessions } from "../db/schema";
import { eq } from "drizzle-orm";

// Founding Charter 1.1 — the minimum age is eighteen.

const NOW = Date.now();

async function setup() {
  const db = createTestDb();
  let community = await ensureCommunity(db);
  const ids: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [m] = await db
      .insert(members)
      .values({ communityId: community.id, name: `u${i}`, email: `u${i}@t.test`, passwordHash: "x", salt: "x", joinedAt: 0, lastActiveAt: NOW, phone: `+1555${4000000 + i}`, ageDeclaredAt: NOW })
      .returning();
    ids.push(m.id);
  }
  community = { ...community, founderId: ids[0] };
  await appointModerator(db, community, ids[0], ids[1], NOW);
  return { db, community, founder: ids[0], mod: ids[1], other: ids[2], child: ids[3] };
}

describe("minimum age (Charter 1.1)", () => {
  it("is eighteen", () => {
    expect(MINIMUM_MEMBER_AGE).toBe(18);
  });

  it("a moderator closes the account: personal data wiped, record stays, sessions end", async () => {
    const s = await setup();
    await s.db.insert(sessions).values({ token: "tok", memberId: s.child, expiresAt: NOW + 1e6 });
    const r = await closeUnderageAccount(s.db, s.community, s.mod, "u3", NOW);
    expect(r).toEqual({ ok: true });
    const [row] = await s.db.select().from(members).where(eq(members.id, s.child));
    expect(row.leftAt).toBe(NOW);
    expect(row.phone).toBeNull();
    expect(row.email).toMatch(/@left\.triarc\.internal$/);
    expect(row.name).toBe("u3");
    expect(await s.db.select().from(sessions).where(eq(sessions.memberId, s.child))).toHaveLength(0);
    const log = await s.db.select().from(record);
    expect(log.some((x) => /u3's account was closed under the minimum-age rule/.test(x.text))).toBe(true);
  });

  it("the founder may also close one; an ordinary Member may not", async () => {
    const s = await setup();
    expect(await closeUnderageAccount(s.db, s.community, s.other, "u3", NOW)).toEqual({ ok: false, reason: "not-authorised" });
    expect(await closeUnderageAccount(s.db, s.community, s.founder, "u3", NOW)).toEqual({ ok: true });
  });

  it("unknown username and already-closed accounts are refused", async () => {
    const s = await setup();
    expect(await closeUnderageAccount(s.db, s.community, s.mod, "nobody", NOW)).toEqual({ ok: false, reason: "not-found" });
    await closeUnderageAccount(s.db, s.community, s.mod, "u3", NOW);
    expect(await closeUnderageAccount(s.db, s.community, s.mod, "u3", NOW)).toEqual({ ok: false, reason: "already-left" });
  });
});
