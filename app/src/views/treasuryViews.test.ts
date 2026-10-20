import { describe, it, expect } from "vitest";
import { TreasuryPage, type TreasuryProps } from "./treasury";

const base: TreasuryProps = {
  member: { id: 1, name: "alice" },
  adminDebug: false,
  communityName: "The Triarc",
  ops: 0, dividend: 0, reserve: 0, periodDays: 30, dividendCapMultiple: 5, dividendCapMemberCount: 1, foundationPoolShare: 0.5,
  dividendsPaid: 0, nextDividendAt: 0, ledger: [], reserveMonthsCovered: 12,
};

describe("Treasury page — who receives the dividend (Treasury Code 9)", () => {
  it("says every verified Member is entitled and the equal share divides across all of them, to a Member and to a visitor alike", () => {
    for (const member of [base.member, null]) {
      const html = String(TreasuryPage({ ...base, member }));
      expect(html).toContain("Every verified Member is entitled to the dividend");
      expect(html).toContain("divided by the number of verified Members");
    }
  });
  it("has no age attestation form and describes no age tier", () => {
    const html = String(TreasuryPage(base));
    expect(html).not.toContain("attest");
    expect(html).not.toMatch(/age of majority/i);
  });
});
