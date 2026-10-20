import { Layout } from "./layout";

// GET /tour - "Look around before you join". A short curated page for a skeptical visitor.
// Built ONLY from routes that are already public in isPublicRequest (index.tsx) and documents that
// are already published at /documents: it adds no data of its own, reads nothing from the database
// and exposes nothing a logged-out visitor cannot already open. If a page that would be ideal is
// not public (voting, delegating, logging contributions), the page says so and links nothing there.
// Voice: modest claims; no promise of income or outcome; no urgency, no scarcity (Rules of
// Procedure 4.3). The one Join link is at the foot.
//
// tour.test.ts guards two things: every internal link here is a public path, and the page has
// exactly one link to /register.

const STEPS: { name: string; body: string; pages: [string, string][]; docs: [string, string][] }[] = [
  {
    name: "A proposal",
    body: "Any Member may submit a proposal, which says what it would change and why. Proposals are open to read for anyone, signed in or not.",
    pages: [["/proposals", "Browse the proposals"]],
    docs: [
      ["/documents/charter#3.1", "Charter 3.1: the four public stages"],
      ["/documents/rules-of-procedure#1.1", "Rules of Procedure 1.1: submitting a proposal"],
    ],
  },
  {
    name: "Deliberation",
    body: "Discussion stays open for a fixed window set by the kind of proposal, and nothing is deliberated, voted and recorded in one day. A visitor may read every proposal and, with a first comment or a question, take part without an account.",
    pages: [["/proposals", "Read the discussions on the proposals page"]],
    docs: [
      ["/documents/rules-of-procedure#2.4", "Rules of Procedure 2.4: deliberation is open to the public"],
      ["/documents/rules-of-procedure#1.4", "Rules of Procedure 1.4: the windows are minimums"],
    ],
  },
  {
    name: "A vote",
    body: "Each Member has one vote, cast directly or through a delegation they can take back at any moment. Votes are public. Casting a vote or a delegation needs an account, so that step is not open to visitors; the running tally of any proposal is shown on its page.",
    pages: [["/proposals", "See where proposals stand"], ["/directory", "See which sectors have a Delegate"]],
    docs: [
      ["/documents/rules-of-procedure#3.1", "Rules of Procedure 3.1: votes are public"],
      ["/documents/charter#3.3", "Charter 3.3: delegation"],
    ],
  },
  {
    name: "The record",
    body: "The outcome, the vote and the discussion go into a permanent public record. Nothing there is edited in place; a mistake is fixed by a correction entry that points at what it corrects.",
    pages: [["/record", "Read the record"]],
    docs: [
      ["/documents/rules-of-procedure#5.1", "Rules of Procedure 5.1: what the record holds"],
      ["/documents/rules-of-procedure#5.2", "Rules of Procedure 5.2: append-only"],
    ],
  },
];

const INSPECT: [string, string, string][] = [
  ["/record", "The record", "What has happened here, in order."],
  ["/governance-health", "Governance health", "Indicators computed from the public record, including how concentrated delegation is."],
  ["/documents", "The documents", "The founding documents, which are proposals and not ratified law."],
  ["/documents/defaults", "The defaults page", "Every number the community can change, with where it came from."],
  ["/proposals", "The proposals", "What is open for discussion and what has been decided."],
  ["/treasury", "The treasury ledger", "Balances and the public ledger."],
  ["/status", "Sign-up status", "Whether sign-ups are open and how many people joined in the last hour."],
];

export const TourPage = (p: {
  member: { id: number; name: string; unreadCount?: number } | null;
  adminDebug: boolean;
  communityName: string;
  requirePhoneVerification: boolean;
}) => (
  <Layout title="Look around before you join" member={p.member} adminDebug={p.adminDebug} communityName={p.communityName}>
    <h2 class="pagetitle">Look around before you join</h2>
    <div style="max-width:44rem">
      <p>
        A Member of {p.communityName} can read and comment on proposals, vote on them directly or hand their vote to someone they
        trust, and log contributions to a public record. Every Member has exactly one vote, and a delegation can be taken back
        at any moment. {p.communityName} is a test of this way of governing, run in public: the founding documents are proposals
        and not ratified law, and no dividend can be paid until the conditions in the Charter are met.
      </p>
      <p class="muted small" style="margin-top:.6rem">
        Joining takes a username, an email address, a password and your declaration that you are at least eighteen.
        {p.requirePhoneVerification ? " Voting and delegating also need a verified phone number (Triarc Membership Code 2.1)." : ""}
      </p>
    </div>

    <h3 style="font-size:1.2rem;margin:1.8rem 0 .8rem">How a decision gets made</h3>
    <ol style="max-width:44rem;padding-left:1.4rem">
      {STEPS.map((s) => (
        <li class="card" style="margin-bottom:.8rem;list-style-position:outside">
          <span class="label">{s.name}</span>
          <p>{s.body}</p>
          <p class="small sans" style="margin-top:.5rem">
            {s.pages.map(([href, text], i) => (
              <>
                {i > 0 && " · "}
                <a href={href}>{text}</a>
              </>
            ))}
          </p>
          <p class="muted small sans" style="margin-top:.3rem">
            In the documents:{" "}
            {s.docs.map(([href, text], i) => (
              <>
                {i > 0 && " · "}
                <a href={href}>{text}</a>
              </>
            ))}
          </p>
        </li>
      ))}
    </ol>

    <h3 style="font-size:1.2rem;margin:1.8rem 0 .8rem">What you can inspect right now, without an account</h3>
    <div class="card" style="max-width:44rem">
      {INSPECT.map(([href, name, what]) => (
        <div class="row">
          <a href={href}>{name}</a>
          <span class="muted small" style="flex:1;text-align:right">{what}</span>
        </div>
      ))}
    </div>
    <p class="muted small" style="max-width:44rem;margin-top:.8rem">
      Some things are not public and need an account: voting, delegating, logging contributions, and Member profiles. They are
      not linked from here.
    </p>

    <div class="card" style="max-width:44rem;margin-top:1.8rem">
      {p.member ? (
        <p>
          You are signed in already. <a href="/dashboard">Back to the dashboard</a>.
        </p>
      ) : (
        <>
          <p style="margin-bottom:.8rem">If you would like to take part, you can join whenever you are ready. There is no deadline.</p>
          <a class="btnlink primary" href="/register">
            Join {p.communityName}
          </a>
        </>
      )}
    </div>
  </Layout>
);
