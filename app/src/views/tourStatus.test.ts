import { describe, it, expect } from "vitest";
import { TourPage } from "./tour";
import { StatusPage } from "./status";
import { isPublicRequest } from "../index";
import { documentsData } from "../generated/documents";

const base = { member: null, adminDebug: false, communityName: "The Triarc" };

function hrefs(html: string): string[] {
  return [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, "&"));
}

describe("/tour", () => {
  const html = String(TourPage({ ...base, requirePhoneVerification: true }));

  it("is built only from public pages: every internal link is open to a logged-out visitor", () => {
    const internal = hrefs(html).filter((h) => h.startsWith("/"));
    expect(internal.length).toBeGreaterThan(10);
    for (const h of internal) {
      const path = h.split("#")[0].split("?")[0];
      expect(isPublicRequest("GET", path), `${h} must be public`).toBe(true);
    }
  });

  it("links the public pages the brief names", () => {
    const all = hrefs(html);
    for (const p of ["/record", "/governance-health", "/documents", "/documents/defaults", "/status", "/proposals"]) expect(all, p).toContain(p);
  });

  it("every documents link with a clause fragment points at a clause that exists", () => {
    const withClause = hrefs(html).filter((h) => /^\/documents\/[a-z0-9-]+#/.test(h));
    expect(withClause.length).toBeGreaterThanOrEqual(6);
    for (const h of withClause) {
      const [, slug, id] = h.match(/^\/documents\/([a-z0-9-]+)#(.+)$/)!;
      const doc = documentsData.documents.find((d) => d.slug === slug);
      expect(doc, `${h}: no document ${slug}`).toBeTruthy();
      expect(doc!.clauses.some((c) => c.id === id), `${h}: no clause ${id}`).toBe(true);
    }
  });

  it("walks proposal, deliberation, vote, record in that order", () => {
    const at = ["A proposal", "Deliberation", "A vote", "The record"].map((s) => html.indexOf(`>${s}<`));
    expect(at.every((i) => i > 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it("has exactly one Join link, to /register", () => {
    expect(hrefs(html).filter((h) => h === "/register")).toHaveLength(1);
    expect(html).toContain("Join The Triarc");
  });

  it("says plainly what is not public instead of linking it", () => {
    expect(html).toContain("not public and need an account");
    for (const h of ["/delegation", "/contribution", "/people", "/notifications/inbox"]) expect(hrefs(html)).not.toContain(h);
  });

  it("makes no promise of money or outcomes and uses no urgency or scarcity (Rules of Procedure 4.3)", () => {
    const text = html.replace(/<[^>]*>/g, " ");
    expect(text).not.toMatch(/\bearn (money|income)|guarantee|get paid|you will receive|hurry|act now|last chance|limited (time|spots)|spots? (left|remaining)|only \d+|countdown|don't miss|don’t miss/i);
  });

  it("mentions phone verification only where it is required, and offers a signed-in Member no Join link", () => {
    expect(html).toContain("verified phone number");
    expect(String(TourPage({ ...base, requirePhoneVerification: false }))).not.toContain("verified phone number");
    const signedIn = String(TourPage({ member: { id: 1, name: "alice" }, adminDebug: false, communityName: "The Triarc", requirePhoneVerification: true }));
    expect(hrefs(signedIn)).not.toContain("/register");
  });
});

describe("/status page", () => {
  it("open: says open, shows the cap and the plain count", () => {
    const html = String(StatusPage({ ...base, cap: 200, recent: 17, throttled: false, retryMinutes: 1 }));
    expect(html).toContain(">Open<");
    expect(html).toContain(">200<");
    expect(html).toContain(">17<");
    expect(html).toContain("new Members per rolling hour");
    expect(html).toContain("Charter 1.1");
    expect(html).not.toContain("paused");
  });

  it("throttled: says briefly paused, gives a rough wait, and promises no one is turned away for good", () => {
    const html = String(StatusPage({ ...base, cap: 200, recent: 200, throttled: true, retryMinutes: 12 }));
    expect(html).toContain("Briefly paused");
    expect(html).toContain("about");
    expect(html).toContain("12 minutes");
    expect(html).toContain("no one is turned away permanently");
  });

  it("no cap set: says so, and is open", () => {
    const html = String(StatusPage({ ...base, cap: 0, recent: 3, throttled: false, retryMinutes: 1 }));
    expect(html).toContain(">None<");
    expect(html).toContain("no hourly cap is set");
    expect(html).toContain(">Open<");
  });

  it("uses no urgency or scarcity language", () => {
    for (const throttled of [false, true]) {
      const text = String(StatusPage({ ...base, cap: 200, recent: 200, throttled, retryMinutes: 5 })).replace(/<[^>]*>/g, " ");
      expect(text).not.toMatch(/hurry|act now|last chance|spots? (left|remaining)|limited|countdown|only \d+/i);
    }
  });
});
