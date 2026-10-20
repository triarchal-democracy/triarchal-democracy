// The Triarc's professional front door.
// Content adapted from docs/About_The_Triarc.md, styling ported from
// site/about-the-triarc.html (the Vercel-hosted static rendering of the same
// document) rather than app/src/views/layout.tsx's plainer governance-app
// chrome — this page needs to read as the Triarc's own professional site,
// not another tab in the app. Deliberately NOT wrapped in <Layout>: it has
// its own nav and its own visual register, with the live governance app one
// clear click away ("/dashboard").
//
// Naming: Triarchal Framework is the open-source software only. The Triarc
// (communityName here) is the nonprofit that develops and stewards it, and
// governs itself directly through its own liquid-democracy vote — this page
// is the Triarc's own institutional site, not Triarchal Framework's.
//
// Server-rendered, zero client-side JS, same as every other view in this
// app.
import type { FC } from "hono/jsx";

const STYLE = `
:root {
  --paper: #faf7f2; --ink: #1c1a17; --ink-soft: #4a463f;
  /* Same WCAG AA fix layout.tsx already applies to this palette's
     --ink-faint (was #8a857b, ~3.4:1 — fails 4.5:1 for normal text). */
  --ink-faint: #6b665c;
  --rule: #e2dcd2; --accent: #7a2e2e; --accent-soft: #f3e9e4; --measure: 42rem;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  background: var(--paper); color: var(--ink);
  font-family: 'Newsreader', Georgia, serif; font-size: 1.1rem; line-height: 1.7;
  -webkit-font-smoothing: antialiased;
}
.sans { font-family: 'Inter', sans-serif; }
nav.top {
  position: sticky; top: 0; z-index: 50;
  background: rgba(250,247,242,0.94); backdrop-filter: blur(8px);
  border-bottom: 1px solid var(--rule);
}
.nav-inner {
  max-width: 72rem; margin: 0 auto;
  display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap;
  padding: 0.85rem 1.5rem; gap: 0.8rem;
}
.nav-title { font-family: 'Newsreader', serif; font-weight: 600; font-size: 1.05rem; color: var(--ink); text-decoration: none; }
.nav-title span { color: var(--accent); }
.nav-links { display: flex; align-items: center; gap: 1.3rem; flex-wrap: wrap; }
.nav-links a {
  font-family: 'Inter', sans-serif; font-size: 0.78rem; font-weight: 500;
  letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink-faint); text-decoration: none;
}
.nav-links a:hover { color: var(--accent); }
.nav-links a.cta {
  color: var(--paper); background: var(--accent); padding: 0.5rem 0.9rem; border-radius: 2px;
}
header.hero { max-width: 56rem; margin: 0 auto; padding: 5.5rem 1.5rem 4rem; text-align: center; }
.kicker {
  font-family: 'Inter', sans-serif; font-size: 0.78rem; font-weight: 600;
  letter-spacing: 0.18em; text-transform: uppercase; color: var(--accent); margin-bottom: 2rem;
}
h1 { font-weight: 500; font-size: clamp(2.4rem, 6vw, 4rem); line-height: 1.08; letter-spacing: -0.015em; margin-bottom: 1.6rem; }
.hero-sub { font-size: clamp(1.1rem, 2vw, 1.3rem); font-style: italic; color: var(--ink-soft); max-width: 38rem; margin: 0 auto 2.4rem; line-height: 1.5; }
.hero-ctas { display: flex; gap: 0.9rem; justify-content: center; flex-wrap: wrap; margin-top: 0.6rem; }
.btn {
  display: inline-block; font-family: 'Inter', sans-serif; font-size: 0.88rem; font-weight: 600;
  padding: 0.85rem 1.7rem; border-radius: 2px; text-decoration: none; letter-spacing: 0.01em;
}
.btn.primary { color: var(--paper); background: var(--accent); }
.btn.primary:hover { background: #5e2222; }
.btn.ghost { color: var(--ink); border: 1px solid var(--rule); background: var(--card,#fffdf9); }
.btn.ghost:hover { border-color: var(--accent); color: var(--accent); }
main { max-width: var(--measure); margin: 0 auto; padding: 0 1.5rem 4rem; }
section { padding: 2.4rem 0 0.4rem; }
h2 { font-weight: 600; font-size: 1.6rem; line-height: 1.2; margin-bottom: 1.3rem; scroll-margin-top: 5rem; }
p { margin-bottom: 1.1rem; }
p strong { font-weight: 600; }
.article-label {
  font-family: 'Inter', sans-serif; font-size: 0.75rem; font-weight: 600;
  letter-spacing: 0.16em; text-transform: uppercase; color: var(--accent); display: block; margin-bottom: 0.6rem;
}
.divider { max-width: var(--measure); margin: 2rem auto 0; border: none; border-top: 1px solid var(--rule); }
.closing { text-align: center; padding: 3.6rem 1.5rem 4.5rem; max-width: 48rem; margin: 0 auto; }
.closing h2 { font-size: clamp(1.9rem, 4.5vw, 2.7rem); font-weight: 500; margin-bottom: 1.3rem; }
.closing p { color: var(--ink-soft); max-width: 34rem; margin: 0 auto 2.2rem; }
footer { border-top: 1px solid var(--rule); padding: 2rem 1.5rem 3rem; text-align: center; }
footer p { font-family: 'Inter', sans-serif; font-size: 0.8rem; color: var(--ink-faint); margin: 0.3rem 0; }
footer a { color: var(--ink-faint); }
`;

export const TheTriarcLandingPage: FC<{
  member: { id: number; name: string; unreadCount?: number } | null;
  communityName: string;
}> = ({ member, communityName }) => (
  <html lang="en">
    <head>
      <meta charSet="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>{communityName} — a research-focused governance nonprofit</title>
      <meta
        name="description"
        content={`${communityName} is a research-focused governance nonprofit that studies whether Triarchal Democracy works by practicing it. It also develops and stewards Triarchal Framework, the open-source software that research runs on.`}
      />
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400&family=Inter:wght@400;500;600;700&display=swap"
        rel="stylesheet"
      />
      <style>{STYLE}</style>
    </head>
    <body>
      <nav class="top">
        <div class="nav-inner">
          <a class="nav-title" href="/">
            {communityName}
            <span>.</span>
          </a>
          <div class="nav-links">
            <a href="#what">What {communityName} is</a>
            <a href="#research">Research</a>
            <a href="#accountability">Accountability</a>
            <a href="https://triarchal-democracy.vercel.app" target="_blank" rel="noopener">
              The model ↗
            </a>
            {member ? (
              <a class="cta" href="/dashboard">
                Go to {communityName}
              </a>
            ) : (
              <>
                <a href="/login">Sign in</a>
                <a class="cta" href="/register">
                  Join {communityName}
                </a>
              </>
            )}
          </div>
        </div>
      </nav>

      <header class="hero">
        <div class="kicker">A research-focused governance nonprofit — software stewardship second, live</div>
        <h1>{communityName}</h1>
        <p class="hero-sub">
          {communityName} studies whether Triarchal Democracy works by practicing it, in public, on its own
          governance. Triarchal Framework, the open-source software {communityName} builds and stewards, is how that
          research gets built and shared — and this deployment is both {communityName}'s own live governance and its
          professional home.
        </p>
        <div class="hero-ctas">
          <a class="btn primary" href="/dashboard">
            Enter {communityName} →
          </a>
          <a class="btn ghost" href="/proposals">
            See open proposals
          </a>
        </div>
      </header>

      <main>
        <section id="what">
          <span class="article-label">What {communityName} is</span>
          <p>
            {communityName} is the nonprofit organization behind Triarchal Democracy. It is first a governance
            research organization, and second the steward of <strong>Triarchal Framework</strong>, the open-source
            software that its research runs on. The two are not in tension: {communityName} studies whether liquid
            democracy, a verified contribution ledger, and a two-tier dividend actually work by running its own
            organization on exactly that model, in public, from the outset — electing its own directors and
            approving its own resource decisions through its own liquid-democracy vote (see Accountability, below).
            Building the software is what makes that research reproducible and shareable — a requirement of doing
            the research honestly, not a separate line of business. See{" "}
            <a href="https://triarchal-democracy.vercel.app/the-proposition" target="_blank" rel="noopener">
              the proposition
            </a>{" "}
            and{" "}
            <a href="https://triarchal-democracy.vercel.app/charter" target="_blank" rel="noopener">
              the Founding Charter
            </a>{" "}
            for the model itself; this page is about the organization that studies and carries it forward.
          </p>
        </section>

        <hr class="divider" />

        <section id="research">
          <span class="article-label">Research</span>
          <p>
            {communityName}'s primary output is evidence, not code. Every mechanism Triarchal Democracy proposes —
            delegation that renews instead of calcifying into permanent super-delegates, a contribution ledger
            resistant to gaming, a dividend structure that never lets outside money touch the payout pool — is a
            testable claim, and {communityName} tests it on itself first. Its own governance is the current primary
            research substrate: real delegation-renewal completion rates against the 90-day and annual cycles, real
            Dispute Panel outcomes, real treasury and dividend arithmetic, published on a fixed quarterly cadence
            that treats "what went wrong this quarter" as data worth publishing, not a failure worth hiding.
          </p>
          <p>
            Stating this as the organization's lead identity, not a byproduct of operating in public, matters for two
            practical reasons. It opens a different kind of support than a software project alone would — academic
            and philanthropic funders who back democratic-innovation research specifically, not only technology
            grants. And it reads, to any funder or future regulator, as evidence-gathering first — a meaningfully
            different posture than pure advocacy, which matters given the real political-activity limits any future
            charitable registration would carry. As {communityName}'s own track record of published governance data
            grows, that record is the case for research partnerships and grant funding — evidence offered before
            it's asked for, not promised in advance of having any.
          </p>
        </section>

        <hr class="divider" />

        <section id="mission">
          <span class="article-label">Mission</span>
          <p>
            Studying the model requires building and maintaining it, so {communityName} is also, in service of that
            research mission, a steward-plus-active-support nonprofit: it develops Triarchal Framework, the
            open-source software, and it actively funds and coordinates real support for anyone running it —
            training, accessibility outreach into communities that would otherwise be left out, and help actually
            standing up physical, in-person access points where they're needed. A platform nobody can use well
            produces no usable research data either; closing that gap is part of doing the research honestly, not a
            separate charitable add-on.
          </p>
        </section>

        <hr class="divider" />

        <section id="funding">
          <span class="article-label">Funding</span>
          <p>
            {communityName} runs on a blended model, deliberately, so that no single funding source can determine
            what Triarchal Framework does or who can use it.
          </p>
          <p>
            <strong>The base is grants and donations.</strong> This is what keeps the software free and accessible
            regardless of any given community's resources — a small municipal deployment and a well-funded one
            start from the same platform, at the same cost: nothing.
          </p>
          <p>
            <strong>An optional, transparent support fee</strong> is available on top of that base, but only from
            well-resourced deployments that have reached real delegated budget authority (the Delegated-Authority
            Mechanism of the Government Adoption Compact) — a deployment actually managing meaningful public funds
            through the platform may choose to pay {communityName} for a scaled level of support. The fee scales to
            what the deployment is actually managing, and it is publicly disclosed, on both sides: what{" "}
            {communityName} charges, and what the deployment pays.
          </p>
          <p>
            This fee is institutional money, and it is bound by Treasury Code 1.4 exactly like any other
            institutional contribution, for every deployment without exception: it funds operations, never the
            dividend pool. {communityName}'s support fee can help a deployment run — it can never quietly become
            part of what gets paid out to members. The dividend is the community's own money, or it is not the
            Foundation Dividend at all.
          </p>
        </section>

        <hr class="divider" />

        <section id="accessibility">
          <span class="article-label">Accessibility</span>
          <p>Accessibility is not a single feature; {communityName} treats it as two distinct, parallel commitments.</p>
          <p>
            <strong>A dedicated real-world support program</strong> — physical access points, in-person onboarding
            help for members who need it, and partnerships with libraries, community centers, and similar local
            institutions that already know how to reach people the internet doesn't. This is {communityName}{" "}
            actively doing outreach, not merely permitting it.
          </p>
          <p>
            <strong>Non-digital participation channels — none of this is built yet.</strong> Phone- and IVR-based
            delegation and voting, and a paper-ballot bridge for verified members, so that a resident without a
            smartphone or reliable internet is not structurally excluded from the governance the platform runs.
            These are first-class paths {communityName} intends to build, not accommodations added afterwards — a
            governance system only accessible to the technically fluent would reproduce the exact exclusion this
            model exists to remove. This is where that principle becomes {communityName}'s own obligation, not just
            the model's.
          </p>
        </section>

        <hr class="divider" />

        <section id="accountability">
          <span class="article-label">Accountability</span>
          <p>
            {communityName} answers to more than its own board. Board seats are held by representatives its own
            membership elects — the same liquid-democracy vote every deployment of Triarchal Framework runs, applied
            here to the organization's own governance — so the people actually using and building Triarchal
            Democracy have a real, ongoing voice in how the software and the organization behind it are run.
          </p>
          <p>
            <strong>A note on language, because it's worth answering plainly:</strong> this structure — authority
            drawn from participating and appointed individuals, routed through {communityName}'s own community vote
            rather than an independently-appointed board acting on its own — has sometimes been described as making{" "}
            {communityName} a "DAO" (decentralized autonomous organization). That description is about how power
            flows, not about the technology underneath it. {communityName} is a conventional Canadian nonprofit
            corporation, not a blockchain entity: no tokens, no smart contracts, no on-chain voting, and its
            treasury never touches cryptocurrency. What the "DAO" framing correctly points at is that{" "}
            {communityName} has no centrally-appointed board acting outside its own membership's vote — that part is
            real, and it runs through the same software every deployment already uses.
          </p>
          <p>
            Concretely: {communityName}'s own governance runs directly through <strong>its own membership</strong> —
            not through a separate, dedicated deployment built specifically for the purpose, and not through a
            bootstrap arrangement waiting to be handed off later. {communityName}'s members elect and confirm its own
            directors and resource decisions through its own liquid-democracy vote from the outset, alongside
            whatever seats Canadian nonprofit law requires be founder-named at incorporation.
          </p>
          <p>
            Beneath all of that sits a hard structural guarantee, not just a governance promise: Triarchal Framework
            is open-source, under a license that lets any deployment fork and self-host it, in full, if{" "}
            {communityName}'s own governance ever drifted from what deployments need. No deployment is a hostage to{" "}
            {communityName}'s board. That exit is real, licensed, and available on day one — not something a
            deployment would have to negotiate for if the moment ever came.
          </p>
        </section>
      </main>

      <div class="closing">
        <span class="article-label">The live app</span>
        <h2>This is where it happens, not just where it's explained.</h2>
        <p>
          Proposals, delegation, the contribution ledger, the treasury — {communityName} is a real, working
          deployment of Triarchal Democracy, not a demo of one.
        </p>
        <a class="btn primary" href={member ? "/dashboard" : "/register"}>
          {member ? `Go to ${communityName} →` : "Join and enter →"}
        </a>
      </div>

      <footer>
        <p>
          {communityName} — the nonprofit that stewards Triarchal Framework, the software it and every other
          deployment runs on.
        </p>
        <p>
          <a href="https://triarchal-democracy.vercel.app/the-proposition" target="_blank" rel="noopener">
            The proposition
          </a>{" "}
          ·{" "}
          <a href="https://triarchal-democracy.vercel.app/charter" target="_blank" rel="noopener">
            The Founding Charter
          </a>{" "}
          · <a href="/governance-health">Governance health</a> · <a href="/record">The Record</a>
        </p>
      </footer>
    </body>
  </html>
);
