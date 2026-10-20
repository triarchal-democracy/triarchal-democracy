// Code of Conduct — the provisions, the graduated sanctions, and how a panel's
// individual votes become one finding. Pure: no database, so every rule here is
// unit-tested directly (conduct.test.ts).

export const CONDUCT_PROVISIONS = [
  { id: "2.1", name: "Bad-faith disruption" },
  { id: "2.2", name: "Contribution fraud" },
  { id: "2.3", name: "Vote and delegation interference" },
  { id: "2.4", name: "Sybil violation" },
  { id: "2.5", name: "Infrastructure sabotage" },
  { id: "2.6", name: "Exposure" },
] as const;

export type ProvisionId = (typeof CONDUCT_PROVISIONS)[number]["id"];

export function isProvisionId(x: string): x is ProvisionId {
  return CONDUCT_PROVISIONS.some((p) => p.id === x);
}

export function provisionName(id: string): string {
  return CONDUCT_PROVISIONS.find((p) => p.id === id)?.name ?? id;
}

// Code of Conduct 3 — the ladder. Panels "must begin at the lowest step adequate
// to the harm".
export const SANCTION_STEPS = [
  { step: 1, ref: "3.1", label: "Public notice", detail: "a panel finding entered in the record, with no further consequence" },
  { step: 2, ref: "3.2", label: "Accrual suspension", detail: "contribution accrual paused; participation, voting and voice continue unimpaired" },
  { step: 3, ref: "3.3", label: "Participation suspension", detail: "posting and proposal rights paused; the Member's vote is unaffected" },
  { step: 4, ref: "3.4", label: "Contribution voidance", detail: "the named fraudulent entries are voided (contribution fraud only)" },
  { step: 5, ref: "3.5", label: "Revocation", detail: "membership ends" },
] as const;

// Code of Conduct 4.5 — chosen defaults, not derived.
export const ACCRUAL_SUSPENSION_DAYS = 30; // 3.2
export const PARTICIPATION_SUSPENSION_DAYS = 30; // 3.3
export const PARTICIPATION_SUSPENSION_MAX_DAYS = 90; // 3.3

/** The highest step a panel can reach: the whole ladder, revocation (3.5) included. */
export const MAX_AVAILABLE_STEP = 5;

// Dispute Procedure Code 6.2 — a revocation takes effect no sooner than this long after the decision.
export const REVOCATION_HOLD_DAYS = 14;

/** Code of Conduct 4.3 — an interim measure lapses by itself after this many hours unless the reviewing panel keeps it. */
export const INTERIM_MEASURE_HOURS = 72;

/**
 * Whether a panel may impose `step` for `provision`, given the sanction steps
 * already imposed on the same Member by earlier findings (`priorSteps`).
 *
 *  - 3.4 voidance is "for fraud under 2.2" only.
 *  - 3.5 revocation is "reserved for violations 2.4 through 2.6, or persistent
 *    repetition of lesser violations after sanctions at every lower step": for
 *    2.1-2.3 the Member must already have been sanctioned at each lower step
 *    that applies to the provision (1, 2, 3, and 4 as well for fraud).
 */
export function stepAllowed(provision: string, step: number, priorSteps: number[]): boolean {
  if (step === 0) return true;
  if (step < 1 || step > MAX_AVAILABLE_STEP) return false;
  if (step === 4) return provision === "2.2";
  if (step === 5) {
    if (provision === "2.4" || provision === "2.5" || provision === "2.6") return true;
    const needed = provision === "2.2" ? [1, 2, 3, 4] : [1, 2, 3];
    return needed.every((n) => priorSteps.includes(n));
  }
  return true;
}

/** The step a vote for `step` actually counts as: the highest allowed step at or below it. */
export function clampStep(provision: string, step: number, priorSteps: number[]): number {
  for (let s = Math.min(step, 5); s > 0; s--) {
    if (stepAllowed(provision, s, priorSteps)) return s;
  }
  return 0;
}

export function allowedSteps(provision: string, priorSteps: number[]): number[] {
  return [0, 1, 2, 3, 4, 5].filter((s) => stepAllowed(provision, s, priorSteps));
}

export interface ConductVote {
  step: number; // 0 = dismiss
  badFaith: boolean;
}

export interface ConductOutcome {
  decision: "upheld" | "dismissed";
  step: number; // 0 when dismissed
  badFaith: boolean;
  votesCast: number;
  tally: number[]; // index = step 0..5, count of votes (after clamping)
}

/**
 * One finding from many votes. Every vote is a point on the ladder, 0 meaning
 * dismiss. The finding is the LOWER MEDIAN of the votes cast: the step that at
 * least half of the votes reach or exceed, taking the lower of two middle values
 * when the count is even.
 *
 * Why this and not "most common": it is the only rule under which the finding is
 * both a majority position and the lightest one a majority supports — a panel
 * split four for dismissal, four for a notice and three for suspension returns
 * a notice, never the suspension; and a tie between dismissing and sanctioning
 * resolves to dismissal, as Dispute Procedure Code 4.4 ("doubt resolves toward
 * the accused") and the Code of Conduct's lowest-adequate-step rule both ask.
 * No votes at all is a dismissal.
 *
 * Votes above what the provision allows are clamped down before counting (see
 * clampStep), so a majority for an unavailable revocation lands on the step
 * below it rather than failing.
 *
 * A report is found brought in bad faith (Dispute Procedure Code 7.1) only if
 * MORE than half of the votes cast say so.
 */
export function conductOutcome(votes: ConductVote[], provision: string, priorSteps: number[]): ConductOutcome {
  const tally = [0, 0, 0, 0, 0, 0];
  const steps = votes.map((v) => clampStep(provision, v.step, priorSteps)).sort((a, b) => a - b);
  for (const s of steps) tally[s]++;
  const n = steps.length;
  const step = n === 0 ? 0 : steps[Math.floor((n - 1) / 2)];
  const badFaith = n > 0 && votes.filter((v) => v.badFaith).length * 2 > n;
  return { decision: step > 0 ? "upheld" : "dismissed", step, badFaith, votesCast: n, tally };
}

/** Which kind of sanction row a step produces; steps 4 and 5 have their own handling. */
export function sanctionKind(step: number): "notice" | "accrual-suspension" | "participation-suspension" | "voidance" | null {
  switch (step) {
    case 1:
      return "notice";
    case 2:
      return "accrual-suspension";
    case 3:
      return "participation-suspension";
    case 4:
      return "voidance";
    default:
      return null;
  }
}

/** The step a stored sanction row stands for (used to know which lower steps a Member has already been through). */
export function stepOfSanctionKind(kind: string): number | null {
  switch (kind) {
    case "notice":
      return 1;
    case "accrual-suspension":
      return 2;
    case "participation-suspension":
      return 3;
    case "voidance":
      return 4;
    default:
      return null;
  }
}
