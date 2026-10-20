import { describe, it, expect } from "vitest";
import { stepAllowed, clampStep, allowedSteps, conductOutcome, sanctionKind, stepOfSanctionKind } from "./conduct";

const votes = (...steps: number[]) => steps.map((step) => ({ step, badFaith: false }));

describe("which steps a panel may reach", () => {
  it("allows dismissal, notice, accrual and participation suspension for every provision", () => {
    for (const p of ["2.1", "2.2", "2.3", "2.4", "2.5", "2.6"]) {
      for (const s of [0, 1, 2, 3]) expect(stepAllowed(p, s, [])).toBe(true);
    }
  });

  it("allows voidance for fraud (2.2) only", () => {
    expect(stepAllowed("2.2", 4, [])).toBe(true);
    for (const p of ["2.1", "2.3", "2.4", "2.5", "2.6"]) expect(stepAllowed(p, 4, [])).toBe(false);
  });

  it("revocation is open at once for 2.4-2.6 and only after every lower step for 2.1-2.3", () => {
    for (const p of ["2.4", "2.5", "2.6"]) expect(stepAllowed(p, 5, [])).toBe(true);
    expect(stepAllowed("2.1", 5, [1, 2])).toBe(false);
    expect(stepAllowed("2.1", 5, [1, 2, 3])).toBe(true);
    expect(stepAllowed("2.3", 5, [])).toBe(false);
    expect(stepAllowed("2.2", 5, [1, 2, 3])).toBe(false);
    expect(stepAllowed("2.2", 5, [1, 2, 3, 4])).toBe(true);
  });

  it("clamps a revocation vote on a first offence down to the highest allowed step", () => {
    expect(clampStep("2.1", 5, [])).toBe(3);
    expect(clampStep("2.2", 5, [])).toBe(4);
    expect(clampStep("2.1", 5, [1, 2, 3])).toBe(5);
  });

  it("clamps a too-severe vote down to the highest allowed step", () => {
    expect(clampStep("2.1", 4, [])).toBe(3); // voidance is fraud-only
    expect(clampStep("2.2", 4, [])).toBe(4);
    expect(clampStep("2.1", 3, [])).toBe(3);
    expect(clampStep("2.1", 0, [])).toBe(0);
  });

  it("lists the steps open for a provision", () => {
    expect(allowedSteps("2.1", [])).toEqual([0, 1, 2, 3]);
    expect(allowedSteps("2.2", [])).toEqual([0, 1, 2, 3, 4]);
    expect(allowedSteps("2.4", [])).toEqual([0, 1, 2, 3, 5]);
  });
});

describe("conductOutcome — the lower median of the panel's votes", () => {
  it("dismisses when no votes were cast", () => {
    expect(conductOutcome([], "2.1", [])).toMatchObject({ decision: "dismissed", step: 0, votesCast: 0 });
  });

  it("is the step at least half of the votes reach, for an odd panel", () => {
    // 11 votes: 4 dismiss, 4 notice, 3 suspension -> sorted median (6th) is a notice
    const o = conductOutcome(votes(0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2), "2.1", []);
    expect(o).toMatchObject({ decision: "upheld", step: 1 });
    expect(o.tally.slice(0, 3)).toEqual([4, 4, 3]);
  });

  it("dismisses when dismissal holds the majority", () => {
    expect(conductOutcome(votes(0, 0, 0, 0, 0, 0, 3, 3, 3, 3, 3), "2.1", [])).toMatchObject({ decision: "dismissed", step: 0 });
  });

  it("resolves a dead tie between dismissal and sanction toward the accused (lower median)", () => {
    expect(conductOutcome(votes(0, 0, 0, 0, 0, 3, 3, 3, 3, 3), "2.1", [])).toMatchObject({ decision: "dismissed", step: 0 });
  });

  it("is never heavier than a majority supports", () => {
    // 6 want at least a notice, 5 want participation suspension: the finding is a notice, not the suspension
    expect(conductOutcome(votes(1, 1, 1, 1, 1, 1, 3, 3, 3, 3, 3), "2.1", [])).toMatchObject({ decision: "upheld", step: 1 });
    // 6 want at least suspension
    expect(conductOutcome(votes(0, 0, 0, 0, 0, 3, 3, 3, 3, 3, 3), "2.1", [])).toMatchObject({ decision: "upheld", step: 3 });
  });

  it("clamps votes before counting", () => {
    // voidance votes on a non-fraud provision count as participation suspension
    expect(conductOutcome(votes(4, 4, 4, 4, 4, 4, 0, 0, 0, 0, 0), "2.1", [])).toMatchObject({ step: 3 });
  });

  it("finds bad faith only on a strict majority of votes cast", () => {
    const bf = (n: number, total: number) =>
      conductOutcome(Array.from({ length: total }, (_, i) => ({ step: 0, badFaith: i < n })), "2.1", []).badFaith;
    expect(bf(6, 11)).toBe(true);
    expect(bf(5, 11)).toBe(false);
    expect(bf(5, 10)).toBe(false); // exactly half is not a majority
    expect(bf(6, 10)).toBe(true);
  });
});

describe("sanction kinds", () => {
  it("round-trips steps 1-4 and has none for 0 or 5", () => {
    for (const s of [1, 2, 3, 4]) expect(stepOfSanctionKind(sanctionKind(s)!)).toBe(s);
    expect(sanctionKind(0)).toBeNull();
    expect(sanctionKind(5)).toBeNull();
    expect(stepOfSanctionKind("bad-faith-notice")).toBeNull();
  });
});
