# The Contribution Code

*Proposed under the Founding Charter of the Triarc — a founding proposal, not yet law. This code implements Article II: how contribution is logged, verified, weighted, and defended against gaming. Every number in it is a default, reviewable quarterly under clause 2.1 and amendable by ordinary proposal. This is machinery, not principle; the community should expect to revise it often and without ceremony.*

---

## 1. The unit

**1.1** Contribution is measured in **Contribution Marks**, accrued per distribution period (default: monthly, matching the Civic Dividend cycle).

**1.2** Contribution Marks determine two things: a Member's share of the period's Civic Dividend, subject to the accrual cap of charter 5.3 and 4.3 below, and their civic standing.

**1.3** The Contribution Record is permanent, and **standing is computed on a trailing 12-month window**. Dividends already paid are never affected by the window.

**1.4** A logged and verified contribution (Section 3) does not accrue automatically. It enters the record in a **pending** state and must be **claimed** by the Member before it counts toward standing or any dividend distribution. Claiming is a single deliberate act — reviewing the pending entry and confirming it — available from the Member's own Contribution Record at any time.

**1.5** A Member has 60 days from verification to claim a pending contribution. The window is a default, adjustable by ordinary proposal.

**1.6** A contribution unclaimed when its window closes does not accrue, and the lapsed entry is not revived retroactively. The underlying work may be logged again as a new contribution if it remains current. The unclaimed entry is never deleted: it stays on the permanent record, marked unclaimed, exactly as verified.

**1.7** Claiming requires no re-verification and reopens no dispute window.

**1.8** Pending, unclaimed contributions are visible on a Member's own record at all times, with no countdown, reminder, or prompt attached.

## 2. Domains and sectors

Marks are earned, never issued against a quota. A Member accrues them by doing verified work, and the Civic share of the dividend pool — what remains after that cycle's Foundation Dividend share is set aside first under Treasury Code 5.4 — divides among the Marks actually claimed that period. Each domain carries a weight on what a Mark earned in it is worth when that division happens. Founding defaults:

| Domain | Share | What accrues |
|---|---|---|
| Deliberation | 30% | Arguments, evidence, and critique in proposals that other Members attest moved the decision. Dissent that sharpened a proposal counts equally with support that carried it. |
| Craft | 30% | Research, writing, code, design, translation, documentation — logged with a link to the work. |
| Stewardship | 25% | Moderation, onboarding, facilitation, infrastructure maintenance — logged against the duty performed. In-person service to the community, logged against the recognised host that confirms it (3.5). |
| Attestation | 15% | Making careful, attributed attestations of others' contributions. Recognising work is itself work. |

**2.1** Domain shares rebalance quarterly by ordinary proposal. The shares govern what a Mark is worth, never how many may exist.

**2.2** A contribution may also carry a **sector** tag, a topical category distinct from domain. Domain measures what kind of work it is; sector measures what it is about. Sector-tagged Marks, not domain Marks, determine sector-scoped standing under Charter Article IV. The sector list is community-maintained and amendable by ordinary proposal.

**2.3** Founding sector defaults depend on what a deployment governs. A deployment governing a municipality starts from **civic sectors**, drawn from what a city's budget actually covers: Public Safety; Transportation; Parks, Recreation & Culture; Housing, Planning & Development; Utilities & Environment; and Community Platform, the work of running the deployment itself. An organisation governing only its own operations starts from **organisational sectors**: Infrastructure & Technology, Policy & Governance, Outreach & Membership, Finance & Treasury, Dispute & Conduct, Culture & Communications. Either list is a starting point the community amends under 2.2, and a deployment should drop any sector its government does not actually control. A contribution may carry zero, one, or more than one sector tag. An untagged contribution accrues normally and carries no sector-scoped standing.

**2.4** A Member may publicly declare which sectors they follow — a self-declared statement of interest, distinct from sector-scoped standing, which is earned. Following costs nothing, grants no Marks or standing, and is visible on the Member's profile. Declared interest and sector-tagged Contribution Record together feed the ranking Rules of Procedure 4.4 describes; nothing else does.

## 3. Verification

**3.1** Contributions are self-logged with evidence: a link, a diff, an artifact, a thread. Unlogged work, however real, does not accrue.

**3.2** Platform-native actions — votes cast, proposals completed, panels served — verify automatically.

**3.3** Everything else, apart from in-person service (3.5), verifies by **peer attestation**: a claimed contribution accrues when attested by at least two Active Members who did not collaborate on it. Attestations are public, attributed, and permanent.

**3.4** An attestation is a stake of the attestor's own standing. When a panel voids a contribution as fraudulent, every attestation on it is voided too, and the attestors' Attestation-domain Marks for that period are forfeited. Honest error, promptly self-reported, is not penalised.

**3.5** **In-person service.** Unpaid work done in person for the community, through a public institution or not-for-profit organisation the community has recognised as a host by ordinary proposal, accrues as Stewardship. It verifies by the host's own confirmation of who served and for how long, and not by peer attestation: 3.3 does not apply to it. A Member who works for a host or sits on its board may not confirm their own service or a family member's. The list of recognised hosts is public, and recognition is withdrawn the same way it is granted. Work a Member is paid for, by the host or by anyone else, does not accrue.

**3.5a** In-person service sits inside Stewardship rather than in a domain of its own for two reasons. The first is verification. Every other contribution leaves something a stranger can inspect, a link or a thread or a document. Physical work leaves nothing, so resting it on two Members vouching for each other would make it the cheapest contribution to invent. A host that already keeps its own record of who turned up is a witness with no share in the dividend. The second is that a domain must be one a community can earn in. Charter 9.2 does not close the founding phase until contributions have been verified in every domain, and a deployment with no premises and no hosts could never satisfy a domain made only of in-person work. A host can still be captured, by a Member who runs one confirming hours for friends. Public recognition, a public host list and the quarterly review of 6.1 are what stand against that, and they are weaker than an artifact. A deployment with partners on the ground may give service a domain of its own by amending charter 2.2; this clause is the default for one that has not.

## 4. Anti-gaming mechanics

**4.1 Diversity requirement.** No more than 50% of a Member's Marks in any period may count toward that period's Civic Dividend from a single domain. Marks above the cap still count toward standing, and the underlying contribution is never refused at logging. The cap is measured on **domains**, never on sectors.

**4.2 Reciprocity damping.** Attestations between the same pair of Members are progressively discounted within a period: full value, then half, then quarter.

**4.3 The accrual cap.** No Member may receive more than five times an equal share of the new money a cycle commits to distribution, both treasury-funded tiers counted together and no other payment, per charter 5.3, regardless of Marks. The basis is the new money committed, not the sum that happens to go out, and not amounts carried forward. Whatever the cap withholds is not lost: it joins the next cycle's Foundation Dividend under Treasury Code 4.3. Marks above the cap still count toward standing.

**4.4 Novelty over repetition.** Repeating a substantially identical contribution accrues at declining value.

**4.5 The exploit clause.** When the community identifies a gaming pattern this code missed, the weighting fix applies prospectively by ordinary proposal. Retroactive voidance requires a Dispute Panel finding of fraud under the Code of Conduct.

## 5. What never accrues

Voting itself, which is a right rather than a paid act — no Mark may ever attach to *how* anyone votes or delegates; holding delegations, since trust is not labour; founding-period actions by the founder; and any act already sanctioned by a panel in the same period.

## 6. Review

**6.1** Each quarter the community reviews Mark distribution across domains and Members, concentration trends, attestation patterns, claim rates on pending contributions, and any accrual the community regards as unearned. The review is a standing agenda item, not an emergency measure.

**6.2** The question the review asks is the charter's own: not whether the Members with the most free time are accruing, but whether the Members with the least can.

## 7. Opportunities

**7.1** Any Member may post an **opportunity** — a described task or problem the community could use help with — tagged by sector and, where applicable, domain. Posting costs nothing and grants no Marks.

**7.2** Completing or contributing to an opportunity is logged and verified exactly like any other contribution (Section 3).

**7.3** The platform may surface opportunities to Members whose sector-tagged Contribution Record fits. Posting, claiming, and completing an opportunity all remain voluntary, and no Member may be assigned one.

## 8. Positions and Supporting Nominees

**8.1** A **Position** is a named, defined office within a sector — "Housing Delegate," for instance — filled when a Civic Steward becomes a Delegate for that sector under a ratified Position decision (Charter 4.3, Rules of Procedure 1.5). Every Position appears in the public, browsable Steward and Delegate directory (Charter 4.4).

**8.2** A Delegate holding a Position may nominate **Supporting Nominees** to assist in that Position's work.

**8.3** A nominee must already hold an earned Contribution Record in the Position's sector.

**8.4** A nomination confers a recognised title and operational role only, and never any share of the nominating Delegate's vote weight or delegated authority. A Supporting Nominee's governance power remains exactly what they have separately earned as a Member.

**8.5** Every nomination, and the nominee's own Contribution Record, is logged on the public, permanent record the moment the nomination is made.

**8.6** Any Member may challenge a specific nomination. A challenge alleging a conduct or eligibility problem — that this person should not hold any role — goes to a randomly selected Dispute Panel. A challenge alleging the nomination itself is illegitimate or a poor fit — that this appointment is wrong, independent of the nominee's conduct — goes to a community vote at the Position decision threshold (Rules of Procedure 1.3).

**8.7** A Supporting Nominee's role is tied to the nominating Delegate's tenure. If the Delegate's Position lapses under Founding Charter 4.9, or they are removed by ratified Position decision, every nominee's role lapses automatically with it. A successor Delegate may re-nominate the same individuals; nothing carries over automatically.

**8.8** A Supporting Nominee's public profile in the directory (Charter 4.4) discloses their delegation and attestation history with the nominating Delegate and with each other Supporting Nominee under the same Position. This is disclosure only: no appointment is blocked by it, and no diversity quota applies.

**Where does it fail?**

**8.9** **Schedule of defaults.** Every default in this code is **chosen** rather than derived. The monthly accrual period (1.1) matches the dividend cycle so that earning and paying run on the same clock. They do not run on the same window, and the difference is the sixty-day claim window of 1.5: a contribution verified in one period but claimed in the next accrues to the period it was claimed in, because Section 2 divides the pool among the Marks actually claimed that period. A Member can therefore hold a verified contribution back and claim it into a thinner period for a larger share. That is a real lever and this code does not currently close it; sixty days is kept because it is long enough to cover an absence and short enough that a period's ledger eventually closes, and the trade is stated rather than papered over. The domain weightings of Section 2 — 30/30/25/15 — say that argument and craft matter most and equally, that keeping the community running matters nearly as much, and that recognising others' work is real work worth a share of its own; they are the most openly contestable numbers here and 2.1 exists so they can be argued quarterly. Two attestations (3.3) is the smallest number that is not a single point of failure, chosen against three because three is unreachable in a small community and would make the ledger a record of who has friends. Two is not a defence against a ring: 4.2 damps repeat attestations between the same pair, so four or more Members can rotate attestations and meet 3.3 without any pair repeating inside a period. What stands against that is 3.4's forfeiture and the quarterly pattern review of 6.1, not the number two. The trailing twelve-month standing window (1.3) is a year because standing should reflect what a Member has been doing lately rather than what they once did, and any shorter window would let a quiet season erase a long record. The fifty per cent diversity requirement (4.1) is set at half deliberately: it stops a Record being one kind of work repeated. It is not free, and the cost falls on specialists — a Member who only writes code has half their Marks excluded from the dividend division that period, so their payment is roughly halved against an equally productive Member working across two domains. Their standing is untouched and the work is never refused at logging, but calling this requirement costless would be wrong.
