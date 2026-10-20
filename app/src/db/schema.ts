import { sqliteTable, integer, text, real, unique, uniqueIndex, index, type AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// Every table carries community_id (even though there is one row in
// `communities` for now) so multi-tenancy later is a schema/routing change,
// not a rewrite. See CLAUDE.md / Federation Compact.

export const communities = sqliteTable("communities", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  // JSON blob of charter parameters — deliberation/voting windows per
  // proposal class, minimum participation, thresholds, domain shares,
  // dividend cap, delegation expiry, attestations required, founding
  // criteria. See src/lib/params.ts for the shape and defaults.
  params: text("params").notNull(),
  createdAt: integer("created_at").notNull(),
  // Dev/test only: added to Date.now() everywhere "now" is computed, so the
  // debug /admin/advance route can simulate time passing without a real
  // 7-day wait. Always 0 outside local development.
  clockOffsetMs: integer("clock_offset_ms").notNull().default(0),
  // Treasury Code 5.1 — the Foundation Dividend activation gate. Null until
  // the deployment first reaches 30 verified Members with every defined
  // Delegate Position filled; set once, then never cleared. Persisted rather
  // than recomputed each cycle because 5.1 is deliberately ONE-WAY: a baseline
  // that switches off when one Delegate resigns is not a baseline.
  dividendActivatedAt: integer("dividend_activated_at"),
  // Charter 9.3's "the community runs without its founder" criterion. Null
  // until set. Auto-set only on a freshly seeded community, to the first
  // registrant who is the community's only real Member (index.tsx's
  // registration handler — conditioned on both that count AND founder_id
  // still being null, so it can never fire on a community that already had
  // members when this column was added, and can't be won twice by a race).
  // The live community predates this column; the founder sets it there
  // once, by hand — this column is never backfilled by a migration. Never
  // displayed publicly — only ever used to compute a share (see
  // community.ts's computeSustainabilityProgress).
  founderId: integer("founder_id").references((): AnySQLiteColumn => members.id),
});

export const members = sqliteTable("members", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  communityId: integer("community_id").notNull().references(() => communities.id),
  // A public handle, not a legal name — Charter Article VII.2: legal
  // identity is never required or published, only what a Member does.
  name: text("name").notNull().unique(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  salt: text("salt").notNull(),
  joinedAt: integer("joined_at").notNull(),
  lastActiveAt: integer("last_active_at").notNull(),
  // Persistent, Member-switchable display setting — distinct from Rules of
  // Procedure 2.4's per-comment low-visibility posting. "Persistent
  // identity" (Charter 7.2) means the same account continues over time; it
  // does not mean the display level must stay fixed or fully open.
  // "anonymous" | "pseudonymous" | "open"
  visibilityLevel: text("visibility_level").notNull().default("open"),
  // Set once, at the end of the onboarding flow (pick sectors, then a brief
  // walkthrough of voting/delegation) — both happen once, at signup.
  onboardedAt: integer("onboarded_at"),
  // null for every ordinary member. "default_delegate_seat" marks a
  // placeholder row standing in for a Default-Delegate Mechanism public seat
  // (Government Adoption Compact §3, renamed from "Path A" in the Aug 2026
  // documentation amendment — see CLAUDE.md's Naming section) — it never
  // logs in; it exists only so the existing /delegation mechanism (which
  // already targets members.id) can delegate to a seat without a parallel
  // targeting system. See officialSeats below.
  seatKind: text("seat_kind"),
  // Triarc Membership Code 2.1 (Prompt25_PathA_MembershipEnforcement.md) —
  // the Triarc's own stricter membership floor on top of Founding Charter
  // 1.1's baseline, gated app-wide by the REQUIRE_PHONE_VERIFICATION Worker
  // var (when unset/false, neither column below is ever populated).
  // E.164 format ("+15195551234"), nullable — registration itself never
  // requires a phone (2.2); a Member becomes eligible to vote/delegate only
  // once it's verified (2.3). Never shown on a public profile or in the
  // permanent record (2.1/3.3) — read only by the verification flow itself
  // and the enforcement checks in community.ts/mechanics.ts.
  phone: text("phone").unique(),
  // Null until Twilio Verify confirms the code (app/src/lib/twilioVerify.ts).
  // The 30-day Position-decision eligibility clock (2.4) starts here, not at
  // joinedAt — see mechanics.ts's isPositionVoteEligible.
  phoneVerifiedAt: integer("phone_verified_at"),
  // Dispute Procedure Code 2.1 — "Any Active Member may volunteer for the
  // panel pool." Null = has not volunteered. A single nullable timestamp is
  // enough: the Code asks whether a Member is currently in the pool, not for
  // opt-in history, and opting back out sets this to null. Before this column
  // existed the draw treated every Active Member as pre-volunteered, which
  // 2.1 does not say.
  disputePoolOptInAt: integer("dispute_pool_opt_in_at"),
  // Charter 1.3 — "A Member may leave at any time." Null for every current
  // Member. Set once, when they leave; leaving is final for the account. A
  // left Member's name and Contribution Record stay in the public history,
  // but they no longer count as a Member, can't sign in, and their email and
  // phone are scrubbed (community.ts's leaveMembership).
  leftAt: integer("left_at"),
  // Code of Conduct 3.5 — set (together with leftAt) when a Dispute Panel's revocation takes effect. Unlike leaving, revocation keeps the email and phone on the row, so the same person cannot simply register again with them.
  revokedAt: integer("revoked_at"),
  // LEGACY, UNUSED. An earlier design gated the dividend on a separate adult attestation; that tier
  // was abolished (Treasury Code 9.1: every verified Member is entitled). Nothing reads or writes this
  // column any more. It stays in the schema only so that dropping it does not need a migration.
  adultAttestedAt: integer("adult_attested_at"),
  // Charter 1.1 — when the Member declared at registration that they are at least eighteen, the minimum
  // age. Null only for accounts created before the rule. The column name is historical (the minimum was
  // once thirteen) and is kept so that no migration is needed.
  ageDeclaredAt: integer("thirteen_declared_at"),
});

export const sessions = sqliteTable("sessions", {
  token: text("token").primaryKey(),
  memberId: integer("member_id").notNull().references(() => members.id),
  expiresAt: integer("expires_at").notNull(),
});

// Topical taxonomy distinct from the four Contribution domains — Contribution
// Code 2.2. Community-maintained and amendable by ordinary proposal; there is
// no proposal-effect-execution engine anywhere in this app (no ratified
// proposal auto-mutates system state), so additions/deactivations go through
// the same ADMIN_DEBUG direct-management convention as everything else that's
// "community-set" (domain shares, dividend cap, etc.) — see /admin/sectors.
export const sectors = sqliteTable("sectors", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  communityId: integer("community_id").notNull().references(() => communities.id),
  name: text("name").notNull(),
  active: integer("active").notNull().default(1),
  createdAt: integer("created_at").notNull(),
  // Retired column: always null for sectors seeded now. It was kept (rather
  // than dropped) because removing it would mean editing already-applied
  // migrations.
  cityProfileId: text("city_profile_id"),
});

// ordinary | treasury | position | amendment | entrenched — Rules of Procedure 1.3
export const proposals = sqliteTable("proposals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  communityId: integer("community_id").notNull().references(() => communities.id),
  by: integer("by").notNull().references(() => members.id),
  title: text("title").notNull(),
  why: text("why").notNull(),
  cost: text("cost"),
  reversal: text("reversal"),
  cls: text("cls").notNull(),
  submittedAt: integer("submitted_at").notNull(),
  voteFreezeAt: integer("vote_freeze_at").notNull(),
  voteOpensAt: integer("vote_opens_at").notNull(),
  votingClosesAt: integer("voting_closes_at").notNull(),
  // deliberation | voting | record
  stage: text("stage").notNull().default("deliberation"),
  outcome: text("outcome"),
  tally: text("tally"),
  // Rules of Procedure 1.6 — amendment/entrenched/position are always
  // critical; a treasury proposal is critical above CRITICAL_TREASURY_SHARE
  // of the treasury; anything else can be petitioned critical before voting
  // opens. Critical proposals require delegations renewed within the
  // shorter cycle (Charter 3.3 / params.delegationExpiryCriticalDays).
  critical: integer("critical").notNull().default(0),
  // Rules of Procedure 1.3a — a proposal with a genuine external deadline may
  // petition (same 10%-of-Active-Members mechanic as `critical`, a distinct
  // petition for a distinct purpose) to run on the pre-Aug-2026-amendment
  // Ordinary/Treasury timeline (7d deliberation, 5d voting) instead of the
  // lengthened default. Independent of `critical` — a proposal may be
  // neither, either, or both.
  timeSensitive: integer("time_sensitive").notNull().default(0),
  timeSensitiveDeadlineNote: text("time_sensitive_deadline_note"), // the stated deadline, required when the petition succeeds
  // Set when the vote closes — Charter 9.2's "minimum participation met in a
  // majority of votes over the trailing 90 days" Phase I criterion needs
  // this as a real field rather than parsing `outcome`'s label text.
  metMinParticipation: integer("met_min_participation"),
  // Dollars — only meaningful for cls="treasury" or cls="treasury_reserve";
  // separate from the free-text `cost` field so the 5%-of-treasury critical
  // rule is computable.
  amount: integer("amount"),
  // Position-decision fields only (Charter 4.3 / Rules of Procedure 1.5):
  // who's being recognized/removed as Delegate, for which sector.
  targetMemberId: integer("target_member_id").references(() => members.id),
  targetSectorId: integer("target_sector_id").references(() => sectors.id),
  // "recognize" | "remove" | "challenge_nomination". The third targets a
  // Supporting Nominee instead of a Delegate seat — Contribution Code 8.6's
  // "poor fit" challenge path, reusing the Position-decision class directly.
  positionAction: text("position_action"),
  // No .references() helper here on purpose — supportingNominees already
  // references delegateRecognitions, which references proposals, so a
  // formal FK back to supportingNominees would create a circular type that
  // TypeScript can't infer. Enforced at the app layer instead.
  targetSupportingNomineeId: integer("target_supporting_nominee_id"),
  // Clause-structured amendments — JSON array of "documentSlug#clauseId" keys
  // this proposal names as its target(s), e.g. '["charter#1.2","charter#3.2"]'.
  // Null for every proposal submitted before this column existed, and for any
  // proposal (any class, any document) that names no clause — which stays
  // allowed outside the 4 in-scope documents (Charter, plus every document
  // containing an entrenched clause). A JSON array in one text column, not a
  // junction table: there is exactly one place this is ever read (one
  // proposal's own detail view and list row), never a cross-proposal "which
  // proposals touch clause X" query — same shape as the existing `tally`
  // column on this same table, not a new pattern.
  targetClauseIds: text("target_clause_ids"),
  // Dispute Procedure Code 6.1 — a proposal to overturn a Dispute Panel's
  // decision. Ratifying it (at the charter-amendment threshold) overturns the
  // decision. No foreign key for the same circular-type reason as above.
  overturnsPanelId: integer("overturns_panel_id"),
  // Rules of Procedure 6.5 — a joint-authority question the co-Delegates
  // deadlocked on, referred to a community vote at the Ordinary threshold.
  // Ratifying it carries the action out. No foreign key, same reason as above.
  jointActionId: integer("joint_action_id"),
});

export const votes = sqliteTable(
  "votes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    proposalId: integer("proposal_id").notNull().references(() => proposals.id),
    memberId: integer("member_id").notNull().references(() => members.id),
    value: integer("value").notNull(), // 1 = yes, 0 = no
    castAt: integer("cast_at").notNull(),
  },
  (t) => ({ onePerMember: unique().on(t.proposalId, t.memberId) })
);

// Deliberation thread on a proposal — permanent, never edited or deleted in
// place (Rules of Procedure 5.2). Not itself a Contribution Mark source: a
// Member who wants Deliberation Marks for an argument logs it as a
// contribution with a link back to the comment (Contribution Code 3.1 — "a
// link... a thread" is valid evidence), reusing the existing
// attestation/claiming pipeline instead of duplicating it here. memberId is
// nullable: Rules of Procedure 2.4 opens low-commitment deliberation to the
// public under a lower-visibility, self-chosen display name — never a
// persistent handle, never Mark-eligible.
export const proposalComments = sqliteTable("proposal_comments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  proposalId: integer("proposal_id").notNull().references(() => proposals.id),
  memberId: integer("member_id").references(() => members.id),
  displayName: text("display_name"),
  isAnonymous: integer("is_anonymous").notNull().default(0),
  body: text("body").notNull(),
  postedAt: integer("posted_at").notNull(),
  hiddenMeasureId: integer("hidden_measure_id"), // Code of Conduct 4.3 — hidden while this interim measure is in force
});

// sectorId null = "entire" delegation (every decision); set = scoped to one
// sector only (Charter 3.3 — "by sector or entirely"). A member holds at
// most one live entire delegation OR several live sector-scoped ones, never
// both — enforced at the app layer, not here.
export const delegations = sqliteTable(
  "delegations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    memberId: integer("member_id").notNull().references(() => members.id),
    toMemberId: integer("to_member_id").notNull().references(() => members.id),
    sectorId: integer("sector_id").references(() => sectors.id),
    grantedAt: integer("granted_at").notNull(),
    revokedAt: integer("revoked_at"),
  },
  // Charter 3.4 — "every Member can see, at any moment, exactly where their
  // vote sits" only holds if a Member can never have two live delegations of
  // the same scope. The handlers revoke-then-insert, but two requests landing
  // together could both pass that check; these partial unique indexes make the
  // database refuse the second. Two indexes, not one, because SQLite treats
  // NULLs as distinct: sector-scoped rows are unique per (member, sector), and
  // entire-scope rows (sector NULL) are unique per member.
  (t) => ({
    oneLiveSectorDelegation: uniqueIndex("delegations_one_live_per_sector")
      .on(t.memberId, t.sectorId)
      .where(sql`${t.revokedAt} is null and ${t.sectorId} is not null`),
    oneLiveEntireDelegation: uniqueIndex("delegations_one_live_entire")
      .on(t.memberId)
      .where(sql`${t.revokedAt} is null and ${t.sectorId} is null`),
  })
);

// Deliberation | Craft | Stewardship | Attestation — Contribution Code §2
export const contributions = sqliteTable("contributions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  communityId: integer("community_id").notNull().references(() => communities.id),
  memberId: integer("member_id").notNull().references(() => members.id),
  domain: text("domain").notNull(),
  description: text("description").notNull(),
  evidenceLink: text("evidence_link"),
  loggedAt: integer("logged_at").notNull(),
  verifiedAt: integer("verified_at"),
  claimedAt: integer("claimed_at"), // Contribution Code 1.4 — set only by the member's own explicit claim action, within 60 days of verifiedAt; null = pending or lapsed. A contribution counts toward standing or any dividend only once claimed (1.5-1.6).
  // Code of Conduct 3.4 — set when a Dispute Panel voids this entry for fraud. Voiding also clears verifiedAt and claimedAt, so every existing "verified" and "claimed" query stops counting it without being touched; this column and the record entry preserve what happened.
  voidedAt: integer("voided_at"),
  preVoidVerifiedAt: integer("pre_void_verified_at"), // what voiding cleared, kept so an overturn can restore it
  preVoidClaimedAt: integer("pre_void_claimed_at"),
});

export const attestations = sqliteTable(
  "attestations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    contributionId: integer("contribution_id").notNull().references(() => contributions.id),
    attestorId: integer("attestor_id").notNull().references(() => members.id),
    attestedAt: integer("attested_at").notNull(),
    voidedAt: integer("voided_at"),
  },
  (t) => ({ onePerAttestor: unique().on(t.contributionId, t.attestorId) })
);

// donation | grant | dividend | allocation | dividend-return |
// dividend-residue-reallocation
export const treasuryLedger = sqliteTable("treasury_ledger", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  communityId: integer("community_id").notNull().references(() => communities.id),
  kind: text("kind").notNull(),
  amount: integer("amount").notNull(),
  source: text("source").notNull(),
  restriction: text("restriction"),
  memberId: integer("member_id").references(() => members.id),
  recordedAt: integer("recorded_at").notNull(),
});

// Running balances — derivable from treasuryLedger but kept as explicit
// state (mirrors the prototype's S.treasury) since it's mutated
// transactionally on every donation/dividend run.
export const treasuryState = sqliteTable("treasury_state", {
  communityId: integer("community_id").primaryKey().references(() => communities.id),
  opsBalance: integer("ops_balance").notNull().default(0),
  dividendBalance: integer("dividend_balance").notNull().default(0),
  reserveBalance: integer("reserve_balance").notNull().default(0),
  lastDividendAt: integer("last_dividend_at").notNull(),
  dividendsPaid: integer("dividends_paid").notNull().default(0),
});

export const dividendRuns = sqliteTable("dividend_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  communityId: integer("community_id").notNull().references(() => communities.id),
  periodEnd: integer("period_end").notNull(),
  poolAmount: integer("pool_amount").notNull(),
  distributedAmount: integer("distributed_amount").notNull(),
  // Batch 6 — Foundation Dividend redesign (Treasury Code §5): the two
  // tiers are always both live now, so their split is tracked explicitly
  // rather than inferred. foundationDistributed + civicDistributed ==
  // distributedAmount.
  foundationDistributed: integer("foundation_distributed").notNull().default(0),
  civicDistributed: integer("civic_distributed").notNull().default(0),
  // JSON: [{id, marks, foundationAmount, civicAmount, totalAmount}]. Field
  // was "credits" before the Aug 2026 "Contribution Marks" rename — rows
  // written before that rename still carry the old key. Nothing in this app
  // currently reads this blob back, but if something does, read it as
  // `row.marks ?? row.credits` rather than assuming every historical row has
  // been rewritten (it hasn't — this is write-only going forward, not a data
  // migration).
  perMember: text("per_member").notNull(),
});

// Append-only public record — Charter Article VII. Nothing here is ever
// updated or deleted by application code.
export const record = sqliteTable("record", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  communityId: integer("community_id").notNull().references(() => communities.id),
  kind: text("kind").notNull(),
  text: text("text").notNull(),
  memberId: integer("member_id"),
  occurredAt: integer("occurred_at").notNull(),
});

// ---------- Sector tagging (many-to-many; first such pattern in this schema) ----------

export const proposalSectors = sqliteTable(
  "proposal_sectors",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    proposalId: integer("proposal_id").notNull().references(() => proposals.id),
    sectorId: integer("sector_id").notNull().references(() => sectors.id),
  },
  (t) => ({ onePerPair: unique().on(t.proposalId, t.sectorId) })
);

export const contributionSectors = sqliteTable(
  "contribution_sectors",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    contributionId: integer("contribution_id").notNull().references(() => contributions.id),
    sectorId: integer("sector_id").notNull().references(() => sectors.id),
  },
  (t) => ({ onePerPair: unique().on(t.contributionId, t.sectorId) })
);

// A posted task/problem — Contribution Code 7. Posting is free and earns no
// Contribution Mark; completing one is logged as a normal contribution
// (Section 3), this table only changes how work is found, never how it's
// marked.
export const opportunities = sqliteTable("opportunities", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  communityId: integer("community_id").notNull().references(() => communities.id),
  postedBy: integer("posted_by").notNull().references(() => members.id),
  title: text("title").notNull(),
  description: text("description").notNull(),
  domain: text("domain"),
  postedAt: integer("posted_at").notNull(),
});

export const opportunitySectors = sqliteTable(
  "opportunity_sectors",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    opportunityId: integer("opportunity_id").notNull().references(() => opportunities.id),
    sectorId: integer("sector_id").notNull().references(() => sectors.id),
  },
  (t) => ({ onePerPair: unique().on(t.opportunityId, t.sectorId) })
);

// Civic Steward is computed, never stored (Charter 4.2 — "not an office").
// Delegate is stored here, because becoming one requires a ratified Position
// decision (Charter 4.3) — recognizedAt/revokedAt track only the vote-driven
// state; a Delegate can also lapse automatically at read time if their
// sector delegation total falls below threshold, without a row change here.
export const delegateRecognitions = sqliteTable("delegate_recognitions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  communityId: integer("community_id").notNull().references(() => communities.id),
  memberId: integer("member_id").notNull().references(() => members.id),
  sectorId: integer("sector_id").notNull().references(() => sectors.id),
  positionDecisionProposalId: integer("position_decision_proposal_id").notNull().references(() => proposals.id),
  recognizedAt: integer("recognized_at").notNull(),
  revokedAt: integer("revoked_at"),
  // Charter 4.9 — set the first time a tick observes this recognition's
  // current sector-delegation share below the automatic-removal trigger
  // (params.delegateRecallTrigger), cleared the moment share recovers above
  // it. Once now - belowTriggerSince exceeds params.delegateGraceDays while
  // still below the trigger, tick() revokes the recognition automatically,
  // without a vote — see community.ts updateDelegateGraceTimers.
  belowTriggerSince: integer("below_trigger_since"),
  // Charter 4.10 — when a second candidate is installed for a sector that
  // already has an active Delegate, and the two are closely tied in
  // delegated support (params.delegateTieMargin), both rows point at each
  // other here: the Position is held jointly. No .references() helper, same
  // reason as proposals.targetSupportingNomineeId — a self-referential FK
  // on this table would create a circular type TypeScript can't infer.
  // Enforced at the app layer.
  coDelegateOfId: integer("co_delegate_of_id"),
  // Charter 4.8 / Rules of Procedure 1.5a — the open recall-band confirmation
  // vote for this recognition, if one is running. Set when a tick first sees
  // the share in the recall band; cleared when that vote resolves either way.
  // Exists so the sweep doesn't open a fresh vote on every tick.
  confirmationProposalId: integer("confirmation_proposal_id"),
});

// Rules of Procedure 1.6 — signatures toward reclassifying a proposal as
// critical (10% of Active Members, before voting opens). Same shape as
// `attestations`: one signature per member per proposal.
export const criticalPetitionSignatures = sqliteTable(
  "critical_petition_signatures",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    proposalId: integer("proposal_id").notNull().references(() => proposals.id),
    memberId: integer("member_id").notNull().references(() => members.id),
    signedAt: integer("signed_at").notNull(),
  },
  (t) => ({ onePerMember: unique().on(t.proposalId, t.memberId) })
);

// Rules of Procedure 1.3a — signatures toward the time-sensitive petition
// (10% of Active Members, before voting opens). Same shape as
// `criticalPetitionSignatures` on purpose — a distinct petition for a
// distinct purpose, never merged with it.
export const timeSensitivePetitionSignatures = sqliteTable(
  "time_sensitive_petition_signatures",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    proposalId: integer("proposal_id").notNull().references(() => proposals.id),
    memberId: integer("member_id").notNull().references(() => members.id),
    signedAt: integer("signed_at").notNull(),
  },
  (t) => ({ onePerMember: unique().on(t.proposalId, t.memberId) })
);

// A Member's public, self-declared statement of sector interest — Contribution
// Code 2.4. Free, no Mark, no standing. Feeds the ranking formula in Rules
// of Procedure 4.4 alongside the member's own sector-tagged Contribution Record.
export const memberSectorFollows = sqliteTable(
  "member_sector_follows",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    memberId: integer("member_id").notNull().references(() => members.id),
    sectorId: integer("sector_id").notNull().references(() => sectors.id),
    followedAt: integer("followed_at").notNull(),
  },
  (t) => ({ onePerPair: unique().on(t.memberId, t.sectorId) })
);

// ---------- Positions and Supporting Nominees (Contribution Code 8) ----------

// A Supporting Nominee's role is tied to the nominating Delegate's own
// tenure in the Position (Contribution Code 8.7). revokedAt is set only by
// an explicit act — the Delegate's own choice, or a successful "fit"
// challenge — never by the underlying Delegate's automatic threshold-lapse,
// which (like Delegate status itself) is computed at read time, not stored.
export const supportingNominees = sqliteTable("supporting_nominees", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  communityId: integer("community_id").notNull().references(() => communities.id),
  delegateRecognitionId: integer("delegate_recognition_id").notNull().references(() => delegateRecognitions.id),
  nomineeMemberId: integer("nominee_member_id").notNull().references(() => members.id),
  title: text("title").notNull(),
  nominatedAt: integer("nominated_at").notNull(),
  revokedAt: integer("revoked_at"),
});

// A challenge to a specific nomination (Contribution Code 8.6) — "conduct"
// routes to a Dispute Panel below; "fit" routes to a Position-decision
// proposal (proposals.positionAction = "challenge_nomination").
export const nominationChallenges = sqliteTable("nomination_challenges", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  communityId: integer("community_id").notNull().references(() => communities.id),
  supportingNomineeId: integer("supporting_nominee_id").notNull().references(() => supportingNominees.id),
  filedBy: integer("filed_by").notNull().references(() => members.id),
  kind: text("kind").notNull(), // "conduct" | "fit"
  disputePanelId: integer("dispute_panel_id").references(() => disputePanels.id),
  proposalId: integer("proposal_id").references(() => proposals.id),
  filedAt: integer("filed_at").notNull(),
});

// ---------- Minimal Dispute Panel primitive ----------
// Scoped only to what Contribution Code 8.6's conduct-challenge path needs:
// a random panel, a decision window, majority decision. This is NOT the
// full Dispute Procedure Code (no appeals, no delegator/delegate exclusion,
// no general Code of Conduct integration) — flagged deliberately as a
// narrower build than the founding document eventually calls for.
export const disputePanels = sqliteTable("dispute_panels", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  communityId: integer("community_id").notNull().references(() => communities.id),
  subjectKind: text("subject_kind").notNull(), // "supporting-nominee-conduct" today; generic enough to extend
  subjectId: integer("subject_id").notNull(),
  filedBy: integer("filed_by").notNull().references(() => members.id),
  filedAt: integer("filed_at").notNull(),
  decidesBy: integer("decides_by").notNull(), // default 14-day window, Dispute Procedure Code 2.2
  // Dispute Procedure Code 4.2 — the accused has 7 days to respond on the
  // record, and Member Bill of Rights Right IV admits no exceptions to it:
  // no decision may be reached before this passes unless the accused waives.
  respondBy: integer("respond_by").notNull().default(0),
  respondedAt: integer("responded_at"),
  responseWaivedAt: integer("response_waived_at"),
  decision: text("decision"), // "upheld" | "dismissed"
  decidedAt: integer("decided_at"),
  // Conduct reports only (Code of Conduct 3): the step of the ladder the panel
  // settled on (1 = public notice ... 5 = revocation), and whether it found the
  // report itself brought in bad faith (Dispute Procedure Code 7.1).
  sanctionStep: integer("sanction_step"),
  badFaithFinding: integer("bad_faith_finding").notNull().default(0),
  // Dispute Procedure Code 6.2 — a revocation does not take effect for 14 days
  // after the decision, and is held for as long as an overturn proposal filed
  // in time is unresolved. Completed once the Member's membership actually ends.
  revocationEffectiveAt: integer("revocation_effective_at"),
  revocationCompletedAt: integer("revocation_completed_at"),
  // Charter 6.3 / Dispute Procedure Code 6.1 — set when a full community vote
  // overturned this decision.
  overturnedAt: integer("overturned_at"),
});

// Dispute Procedure Code 2.2 — the exclusions ("the parties; anyone holding
// or granting an active delegation to or from a party...; anyone with a
// pending dispute against a party; anyone who served on a panel involving the
// same parties within the trailing 180 days") all require asking "which
// panels involved member X". dispute_panels alone cannot answer that: it
// records only filedBy plus a POLYMORPHIC subject_id whose meaning depends on
// subject_kind. This table makes the party list first-class.
export const disputePanelParties = sqliteTable(
  "dispute_panel_parties",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    panelId: integer("panel_id").notNull().references(() => disputePanels.id),
    memberId: integer("member_id").notNull().references(() => members.id),
    role: text("role").notNull(), // "complainant" | "accused" | "subject"
  },
  (t) => ({ onePerPanelParty: unique().on(t.panelId, t.memberId) })
);

export const disputePanelMembers = sqliteTable(
  "dispute_panel_members",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    panelId: integer("panel_id").notNull().references(() => disputePanels.id),
    memberId: integer("member_id").notNull().references(() => members.id),
    drawnAt: integer("drawn_at").notNull(),
    // Dispute Procedure Code 3.2 — a drawn panelist may decline within 48 hours
    // without stating reasons. The row stays (so the declined Member is never
    // re-drawn for the same panel and the record shows what happened); only
    // panelists with declinedAt NULL are seated.
    declinedAt: integer("declined_at"),
  },
  (t) => ({ onePerPanelMember: unique().on(t.panelId, t.memberId) })
);

// Dispute Procedure Code 3.1 — one row per draw ever requested: the first
// eleven seats of a panel, or a replacement after a decline (3.2). A request
// that cannot be filled yet (pool below the 2.1 minimum, too many 2.2
// exclusions, or the public randomness not yet available) simply stays here and
// is retried by tick(); that is the "disputes queue" of 2.1. The beacon round is
// fixed the first time the request is found drawable and never changes, so the
// randomness cannot be shopped for.
export const disputeDrawRequests = sqliteTable("dispute_draw_requests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  communityId: integer("community_id").notNull().references(() => communities.id),
  subjectKind: text("subject_kind").notNull(),
  subjectId: integer("subject_id").notNull(),
  panelId: integer("panel_id").references(() => disputePanels.id), // null until an initial draw seats the panel
  seq: integer("seq").notNull().default(0), // 0 = the initial draw; k = the k-th replacement
  seats: integer("seats").notNull(),
  requestedAt: integer("requested_at").notNull(),
  partiesJson: text("parties_json").notNull(), // [{ memberId, role }]
  disputedContributionId: integer("disputed_contribution_id"),
  beaconRound: integer("beacon_round"),
  deferralReason: text("deferral_reason"),
  completedAt: integer("completed_at"),
});

// The published record of a draw: everything needed to re-run it and check the
// result (panelDraw.ts verifyDraw). Never edited.
export const disputePanelDraws = sqliteTable("dispute_panel_draws", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  panelId: integer("panel_id").notNull().references(() => disputePanels.id),
  requestId: integer("request_id").notNull().references(() => disputeDrawRequests.id),
  kind: text("kind").notNull(), // "initial" | "replacement"
  method: text("method").notNull(),
  beaconChain: text("beacon_chain").notNull(),
  beaconRound: integer("beacon_round").notNull(),
  beaconRandomness: text("beacon_randomness").notNull(),
  caseKey: text("case_key").notNull(),
  seed: text("seed").notNull(),
  poolJson: text("pool_json").notNull(),
  drawnJson: text("drawn_json").notNull(),
  drawnAt: integer("drawn_at").notNull(),
});

// Code of Conduct 4.1 — "Any Member may report a violation." The report is
// filed on the record; its panel is drawn like any other (subjectKind
// "conduct-report", subjectId = this row's id).
export const conductReports = sqliteTable("conduct_reports", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  communityId: integer("community_id").notNull().references(() => communities.id),
  reportedBy: integer("reported_by").notNull().references(() => members.id),
  accusedId: integer("accused_id").notNull().references(() => members.id),
  provision: text("provision").notNull(), // Code of Conduct "2.1" ... "2.6"
  statement: text("statement").notNull(), // what happened, which provision, what evidence (Dispute Procedure Code 4.1)
  evidenceLink: text("evidence_link"),
  contributionIdsJson: text("contribution_ids_json"), // 2.2 only: the entries alleged to be fraudulent
  filedAt: integer("filed_at").notNull(),
  panelId: integer("panel_id").references(() => disputePanels.id),
});

// Code of Conduct 3 — what a panel's finding did to a Member. One row per
// consequence; "notice" rows have no end and no effect beyond the record, the
// two suspensions run from startsAt to endsAt.
export const memberSanctions = sqliteTable("member_sanctions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  communityId: integer("community_id").notNull().references(() => communities.id),
  memberId: integer("member_id").notNull().references(() => members.id),
  panelId: integer("panel_id").notNull().references(() => disputePanels.id),
  kind: text("kind").notNull(), // "notice" | "accrual-suspension" | "participation-suspension" | "voidance" | "bad-faith-notice"
  step: integer("step").notNull(), // 1-4 (revocation is not a sanction row; it ends the membership)
  startsAt: integer("starts_at").notNull(),
  endsAt: integer("ends_at"),
  createdAt: integer("created_at").notNull(),
  overturnedAt: integer("overturned_at"), // Dispute Procedure Code 6.1 — the finding was overturned by community vote
});

// Code of Conduct 4.3 — "During the founding period the founder may appoint
// interim moderators... that power lapses with Phase I." A row is a standing
// appointment; whether it still carries authority is decided by isModerator.
export const moderators = sqliteTable("moderators", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  communityId: integer("community_id").notNull().references(() => communities.id),
  memberId: integer("member_id").notNull().references(() => members.id),
  appointedBy: integer("appointed_by").notNull().references(() => members.id),
  appointedAt: integer("appointed_at").notNull(),
  removedAt: integer("removed_at"),
});

// Code of Conduct 4.3 / Dispute Procedure Code 5.1 — emergency interim
// measures, "72 hours maximum, lapsing automatically unless a panel reviews and
// extends. Every interim measure is logged when taken." Each one is filed with
// a conduct report (reportId) so a panel exists to review it.
export const interimMeasures = sqliteTable("interim_measures", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  communityId: integer("community_id").notNull().references(() => communities.id),
  moderatorId: integer("moderator_id").notNull().references(() => members.id),
  targetMemberId: integer("target_member_id").notNull().references(() => members.id),
  kind: text("kind").notNull(), // "freeze-account" | "remove-content"
  contentKind: text("content_kind"), // "proposal-comment" | "sector-post" | "sector-comment"
  contentId: integer("content_id"),
  reason: text("reason").notNull(),
  reportId: integer("report_id").notNull().references(() => conductReports.id),
  takenAt: integer("taken_at").notNull(),
  lapsesAt: integer("lapses_at").notNull(),
  extendedAt: integer("extended_at"), // a majority of the reviewing panel approved keeping it until they decide
  endedAt: integer("ended_at"),
});

export const interimMeasureApprovals = sqliteTable(
  "interim_measure_approvals",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    measureId: integer("measure_id").notNull().references(() => interimMeasures.id),
    memberId: integer("member_id").notNull().references(() => members.id),
    approvedAt: integer("approved_at").notNull(),
  },
  (t) => ({ onePerPanelist: unique().on(t.measureId, t.memberId) })
);

export const disputePanelVotes = sqliteTable(
  "dispute_panel_votes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    panelId: integer("panel_id").notNull().references(() => disputePanels.id),
    memberId: integer("member_id").notNull().references(() => members.id),
    upheld: integer("upheld").notNull(), // 1 = uphold the challenge, 0 = dismiss
    // Conduct reports: the Code of Conduct step this panelist considers
    // adequate (0 = dismiss, 1-5 = the ladder), their reasoning (Dispute
    // Procedure Code 4.3 — findings and reasoning are published, dissents
    // included), and whether they consider the report brought in bad faith (7.1).
    step: integer("step"),
    reasoning: text("reasoning"),
    badFaith: integer("bad_faith").notNull().default(0),
    votedAt: integer("voted_at").notNull(),
  },
  (t) => ({ onePerPanelMember: unique().on(t.panelId, t.memberId) })
);

// ---------- Sector discussion wall (Groups → Sectors) ----------
// Freestanding sector content, not tied to any proposal. Same public/
// low-visibility posting pattern as proposalComments (Rules of Procedure
// 2.4); moderation reuses the existing Code of Conduct / Dispute Panel
// mechanics — no new moderation system.

// ---------- Vote-open delegation snapshot (Rules of Procedure 3.3) ----------
// 3.3: "Delegation resolves at the moment voting opens: the platform records a
// snapshot of standing delegations." Before this table there was no snapshot at
// all — resolution ran at close against live rows, so a delegation GRANTED
// during the voting window counted, which 3.3 has always forbidden. Raw
// delegation rows are captured rather than resolved chains, because resolution
// depends on the proposal's sector tags and on delegation expiry, both better
// applied at close against a frozen set than baked in early.
export const proposalDelegationSnapshots = sqliteTable(
  "proposal_delegation_snapshots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    proposalId: integer("proposal_id").notNull().references(() => proposals.id),
    memberId: integer("member_id").notNull().references(() => members.id),
    toMemberId: integer("to_member_id").notNull().references(() => members.id),
    sectorId: integer("sector_id").references(() => sectors.id), // null = entire delegation
    grantedAt: integer("granted_at").notNull(),
    capturedAt: integer("captured_at").notNull(),
    // Set when the delegator revokes while this vote is still open. 3.3 makes
    // revocation instant; only GRANTS defer to the next vote. A renewal must
    // NOT set this — renewing reaffirms the delegation, it does not withdraw it.
    revokedAt: integer("revoked_at"),
  },
  (t) => ({ oneRowPerDelegation: unique().on(t.proposalId, t.memberId, t.toMemberId, t.sectorId) })
);

export const sectorPosts = sqliteTable("sector_posts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  communityId: integer("community_id").notNull().references(() => communities.id),
  sectorId: integer("sector_id").notNull().references(() => sectors.id),
  memberId: integer("member_id").references(() => members.id),
  displayName: text("display_name"),
  isAnonymous: integer("is_anonymous").notNull().default(0),
  title: text("title").notNull(),
  body: text("body").notNull(),
  postedAt: integer("posted_at").notNull(),
  hiddenMeasureId: integer("hidden_measure_id"), // Code of Conduct 4.3 — hidden while this interim measure is in force
});

export const sectorPostComments = sqliteTable("sector_post_comments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  postId: integer("post_id").notNull().references(() => sectorPosts.id),
  memberId: integer("member_id").references(() => members.id),
  displayName: text("display_name"),
  isAnonymous: integer("is_anonymous").notNull().default(0),
  body: text("body").notNull(),
  postedAt: integer("posted_at").notNull(),
  hiddenMeasureId: integer("hidden_measure_id"), // Code of Conduct 4.3 — hidden while this interim measure is in force
});

// ---------- Business Pages (Government Adoption Compact 5.1) ----------
// Managed through an existing Member's own login — no separate auth system.
// Never votes, comments, or reacts; a labeled, non-voting advisory presence.

export const businessPages = sqliteTable("business_pages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  communityId: integer("community_id").notNull().references(() => communities.id),
  managedByMemberId: integer("managed_by_member_id").notNull().references(() => members.id),
  name: text("name").notNull(),
  description: text("description").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const businessPageUpdates = sqliteTable("business_page_updates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  pageId: integer("page_id").notNull().references(() => businessPages.id),
  body: text("body").notNull(),
  postedAt: integer("posted_at").notNull(),
});

export const businessPageFollows = sqliteTable(
  "business_page_follows",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    memberId: integer("member_id").notNull().references(() => members.id),
    pageId: integer("page_id").notNull().references(() => businessPages.id),
    followedAt: integer("followed_at").notNull(),
  },
  (t) => ({ onePerPair: unique().on(t.memberId, t.pageId) })
);

// ---------- Minority reports (Rules of Procedure 5.3) ----------
// A written, attributed dissenting case a Member formally attaches to a
// major proposal — opt-in, preserved on the permanent record whether the
// proposal passes or fails. Distinct from a plain recorded-dissent vote
// (Right X / Rules of Procedure 5.1): this is a substantive written case,
// not just a dissenting ballot. One per Member per proposal.

export const minorityReports = sqliteTable(
  "minority_reports",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    communityId: integer("community_id").notNull().references(() => communities.id),
    proposalId: integer("proposal_id").notNull().references(() => proposals.id),
    memberId: integer("member_id").notNull().references(() => members.id),
    body: text("body").notNull(),
    filedAt: integer("filed_at").notNull(),
  },
  (t) => ({ onePerMember: unique().on(t.proposalId, t.memberId) })
);

// ---------- Notification preferences + delivery (Enterprise_and_Community_Roadmap.md Phase 2) ----------
// Preferences below are opt-in, off by default. No push channel at all:
// push requires client-side JavaScript (a service worker), which this app
// deliberately doesn't have. Delivery (app/src/lib/notify.ts) now writes
// in-app rows and sends email via Resend once a member has opted in.

export const notificationPreferences = sqliteTable(
  "notification_preferences",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    memberId: integer("member_id").notNull().references(() => members.id),
    eventKind: text("event_kind").notNull(),
    channel: text("channel").notNull(), // "in_app" | "email"
    enabled: integer("enabled").notNull().default(0),
  },
  (t) => ({ onePerPref: unique().on(t.memberId, t.eventKind, t.channel) })
);

// The in-app half of delivery — the piece that was missing (preferences
// existed, nothing ever wrote a notification anywhere). `link` is an
// app-relative path (e.g. "/proposals/12"); also doubles as this app's
// simplest per-event duplicate-avoidance key for the cron-driven kinds (see
// app/src/lib/notify.ts and the scheduled() handler in index.tsx) — before
// inserting a cron-driven notification, callers check for an existing row
// with the same (memberId, eventKind, link).
export const inAppNotifications = sqliteTable("in_app_notifications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  communityId: integer("community_id").notNull().references(() => communities.id),
  memberId: integer("member_id").notNull().references(() => members.id),
  eventKind: text("event_kind").notNull(),
  text: text("text").notNull(),
  link: text("link"),
  createdAt: integer("created_at").notNull(),
  readAt: integer("read_at"),
});

// ---------- Default-Delegate Mechanism public seats (Government Adoption Compact §3) ----------
// Renamed from "Path A" in the Aug 2026 documentation amendment — see
// CLAUDE.md's Naming section; "Path A" briefly named the Triarc deployment
// itself after that, then was retired as a deployment name too, in favor of
// "the Triarc" (same section). §3.8 (identity verification sufficient to
// prevent duplicate accounts, before any real official's name is attached)
// and §3.9 (a jurisdiction's own election-law review, before any
// Default-Delegate Mechanism deployment proceeds there) are both real,
// unbuilt blockers. Nothing seeds or reads this table any more (the public
// seats page and its seeding were removed), but the table stays because
// dropping it would mean editing already-applied migrations. memberId points at a placeholder `members` row
// (seatKind="default_delegate_seat") so ordinary delegation already works
// unmodified.

export const officialSeats = sqliteTable("official_seats", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  communityId: integer("community_id").notNull().references(() => communities.id),
  memberId: integer("member_id").notNull().references(() => members.id),
  // A real column, not hardcoded, so seats for more than one jurisdiction
  // would not require a schema change.
  jurisdiction: text("jurisdiction").notNull(),
  seatLabel: text("seat_label").notNull(),
  officialName: text("official_name"),
  electionSeededSupportPct: real("election_seeded_support_pct"),
  electionLabel: text("election_label"),
  // Compact 3.6 — a seat is always visible for delegation; an official
  // appears as an active, responsive delegate only once they've explicitly
  // opted in. Nothing ever sets this to 1.
  optedIn: integer("opted_in").notNull().default(0),
  createdAt: integer("created_at").notNull(),
});

// ---------- Trust hardening (Enterprise_and_Community_Roadmap.md Phase 1) ----------
// Two tables, both write-only in this pass (no UI reads them yet) and both
// deliberately separate from the public, Charter-mandated `record` table
// above: `record` is public by design (Charter Article VII) and must never
// carry an IP address or user-agent. These do, precisely because they're
// never shown to a member or the public.

// Backs POST /login's rate limiting: 5 failed attempts within 15 minutes for
// the same email locks out further attempts for that email (across every
// IP), without revealing whether the email exists. `ip` is recorded for
// audit/investigation but is not itself part of the lockout key — a
// distributed attempt across many IPs against one email is still caught.
export const loginAttempts = sqliteTable("login_attempts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  communityId: integer("community_id").notNull().references(() => communities.id),
  email: text("email").notNull(), // normalized (trimmed, lowercased) — same convention as members.email
  ip: text("ip").notNull(),
  success: integer("success").notNull(), // 1 = succeeded, 0 = failed
  attemptedAt: integer("attempted_at").notNull(),
}, (t) => ({
  // Both rate-limit lookups (per email, per IP) filter on these; without them each login scans the table.
  emailIdx: index("login_attempts_email_idx").on(t.email, t.attemptedAt),
  ipIdx: index("login_attempts_ip_idx").on(t.ip, t.attemptedAt),
}));

// A general, non-public security audit log — login success/failure
// (including lockout rejections) and every /admin/* action. `kind` is free
// text (e.g. "login_success", "login_failure", "admin_action"), not a fixed
// enum, so a new event type never needs a schema change.
export const securityEvents = sqliteTable("security_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  communityId: integer("community_id").notNull().references(() => communities.id),
  kind: text("kind").notNull(),
  memberId: integer("member_id").references(() => members.id), // null when a failed login doesn't resolve to a real member
  ip: text("ip"),
  userAgent: text("user_agent"),
  detail: text("detail"),
  occurredAt: integer("occurred_at").notNull(),
}, (t) => ({
  // Per-IP registration cap (lib/rateLimit.ts) counts kind + ip + time.
  kindIpIdx: index("security_events_kind_ip_idx").on(t.kind, t.ip, t.occurredAt),
  // Community-wide registration throttle (lib/rateLimit.ts) counts kind + time with no ip, which
  // the index above cannot serve (ip sits between them), so without this each sign-up would scan
  // every register row ever written.
  communityKindTimeIdx: index("security_events_community_kind_time_idx").on(t.communityId, t.kind, t.occurredAt),
}));

// ---------- Phone verification (Triarc Membership Code 2.1, the Triarc only) ----------
// Twilio Verify holds the actual OTP server-side (Verify Service SIDs are
// stateful on Twilio's end) — this table doesn't duplicate the code, only
// tracks which member is mid-verification for app-side rate-limiting/expiry
// and to resolve Twilio's asynchronous check back to a member row. One
// member may have several rows over time (a changed number, a retry after
// the code expired); `phone` here is the in-flight attempt, not necessarily
// what ends up on members.phone if the member changes their mind before
// confirming.
export const phoneVerificationAttempts = sqliteTable("phone_verification_attempts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  memberId: integer("member_id").notNull().references(() => members.id),
  phone: text("phone").notNull(),
  startedAt: integer("started_at").notNull(),
  // Set once /verify-phone/confirm succeeds against this attempt — lets a
  // member's attempt history show what happened without deleting rows
  // (matches this schema's general append-rather-than-delete convention).
  confirmedAt: integer("confirmed_at"),
});

// ---------- Sustainability criteria cache (Charter 9.3) ----------
// computeSustainabilityProgress (community.ts) bulk-fetches raw history and
// samples it daily across a 180-day window — real work, not a cheap query.
// tick() runs it at most once per 24h and caches the result here; every page
// that displays Phase II progress reads this row, never recomputes live.
// One row per community (like treasury_state), replaced wholesale on each
// recomputation rather than appending a history of past computations.
export const sustainabilitySnapshots = sqliteTable("sustainability_snapshots", {
  communityId: integer("community_id").primaryKey().references(() => communities.id),
  computedAt: integer("computed_at").notNull(),
  // JSON-serialized SustainabilityProgress (mechanics.ts).
  result: text("result").notNull(),
});

// ---------- Co-Delegate joint authority (Rules of Procedure 6.3-6.8) ----------

// An act of a jointly-held Position that needs both co-Delegates (6.3: nominating
// or revoking a Supporting Nominee), or an arrangement they make between
// themselves (6.6 spokesperson, 6.7 compensation split). One proposes, the other
// accepts; for the 6.3 matters a refusal is a deadlock and either may refer the
// question to a community vote (6.5).
export const jointActions = sqliteTable("joint_actions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  communityId: integer("community_id").notNull().references(() => communities.id),
  sectorId: integer("sector_id").notNull().references(() => sectors.id),
  // The proposer's recognition row at the time; the pair is found through it.
  recognitionId: integer("recognition_id").notNull().references(() => delegateRecognitions.id),
  kind: text("kind").notNull(), // nominate | revoke-nomination | spokesperson | compensation-split
  payloadJson: text("payload_json").notNull(),
  summary: text("summary").notNull(),
  proposedBy: integer("proposed_by").notNull().references(() => members.id),
  proposedAt: integer("proposed_at").notNull(),
  // pending | executed | declined | referred | ratified | rejected | withdrawn | void
  status: text("status").notNull().default("pending"),
  resolvedBy: integer("resolved_by").references(() => members.id),
  resolvedAt: integer("resolved_at"),
  referralProposalId: integer("referral_proposal_id"),
});

// Rules of Procedure 6.6 — the one external spokesperson, designated by mutual
// agreement and reaffirmed each renewal cycle. Absent a current designation the
// co-Delegate holding the larger share of delegated support is it (derived, not stored).
export const positionSpokespersons = sqliteTable("position_spokespersons", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  communityId: integer("community_id").notNull().references(() => communities.id),
  sectorId: integer("sector_id").notNull().references(() => sectors.id),
  memberId: integer("member_id").notNull().references(() => members.id),
  designatedAt: integer("designated_at").notNull(),
  endedAt: integer("ended_at"),
});

// Rules of Procedure 6.7 — an agreed departure from the even split. No row means 50/50.
export const positionCompensationSplits = sqliteTable("position_compensation_splits", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  communityId: integer("community_id").notNull().references(() => communities.id),
  sectorId: integer("sector_id").notNull().references(() => sectors.id),
  firstMemberId: integer("first_member_id").notNull().references(() => members.id),
  secondMemberId: integer("second_member_id").notNull().references(() => members.id),
  firstSharePct: integer("first_share_pct").notNull(),
  agreedAt: integer("agreed_at").notNull(),
  endedAt: integer("ended_at"),
});

// Charter 3.6 / Rules of Procedure 1.5b — a concentration review: when a Member
// holds the review share of a sector's active delegation, a confirmation vote
// opens automatically. One row per review; proposalId is that vote.
export const concentrationReviews = sqliteTable("concentration_reviews", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  communityId: integer("community_id").notNull().references(() => communities.id),
  sectorId: integer("sector_id").notNull().references(() => sectors.id),
  memberId: integer("member_id").notNull().references(() => members.id),
  proposalId: integer("proposal_id").notNull().references(() => proposals.id),
  openedAt: integer("opened_at").notNull(),
  supporters: integer("supporters").notNull(),
  sharePct: real("share_pct").notNull(),
  resolvedAt: integer("resolved_at"),
  outcome: text("outcome"), // "kept" | "ended"
});
