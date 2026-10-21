import { describe, it, expect } from "vitest";
import { createTestDb } from "../../scripts/testDb";
import { ensureCommunity } from "./community";
import { notify } from "./notify";
import { EVENT_KINDS } from "../views/notifications";
import { members, notificationPreferences, inAppNotifications } from "../db/schema";

describe("sector discussion alert", () => {
  it("is a listed, opt-in event kind: nothing is delivered until the Member turns it on", async () => {
    expect(EVENT_KINDS).toContain("sector_discussion_activity");
    const db = createTestDb();
    const community = await ensureCommunity(db);
    const [m] = await db
      .insert(members)
      .values({ communityId: community.id, name: "f", email: "f@t.test", passwordHash: "x", salt: "x", joinedAt: 0, lastActiveAt: 0 })
      .returning();
    await notify(db, {}, community.id, m.id, "sector_discussion_activity", "new reply", "/sectors/1/posts/1", 1);
    expect(await db.select().from(inAppNotifications)).toHaveLength(0);
    await db.insert(notificationPreferences).values({ memberId: m.id, eventKind: "sector_discussion_activity", channel: "in_app", enabled: 1 });
    await notify(db, {}, community.id, m.id, "sector_discussion_activity", "new reply", "/sectors/1/posts/1", 1);
    expect(await db.select().from(inAppNotifications)).toHaveLength(1);
  });
});
