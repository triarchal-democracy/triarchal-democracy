import type { FC, PropsWithChildren } from "hono/jsx";
// Phase 2 stage 5 follow-up (founder review of stop 2) — "renews annually"
// restored as the ordinary-cycle wording (Charter 3.3's own schedule states
// the default as "annual," not as a day count — see
// defaultsRegistry.ts's delegation-expiry-ordinary entry), while the
// critical-decision figure still reads live from params rather than being
// retyped. Threading a live community.params through every view's own
// props (30+ call sites) just for this one line isn't proportionate, so
// this reads the document DEFAULT directly — identical to the live value
// for every community today, since nothing has amended it yet. If a
// community ever does, this footer specifically lags until it's threaded
// live too; flagged, not silently assumed correct forever.
import { DEFAULT_PARAMS } from "../lib/params";

// Palette, type pairing, and layout primitives ported from
// site/prototype.html so the real app reads as the same product.
const STYLE = `
:root {
  --paper:#faf7f2; --ink:#1c1a17; --ink-soft:#4a463f;
  /* --ink-faint was #8a857b — ~3.4:1 against --paper, failing WCAG AA's 4.5:1
     for normal text (checked, not assumed; used at .92rem/.8rem/.66rem
     regular weight across .muted, nav.tabs a, .pill.gray, .footer-note —
     none of those qualify as "large text" under the 3:1 exception).
     Darkened to ~5.3:1 against --paper and ~4.7:1 against --pill.gray's
     #eee9e0 background — same warm-gray hue, just dark enough to pass. */
  --ink-faint:#6b665c;
  --rule:#e2dcd2; --accent:#7a2e2e; --accent-soft:#f3e9e4; --good:#2e6b3a; --card:#fffdf9;
}
/* Visually hidden but present for assistive tech — WCAG 4.1.2/1.3.1: pairs
   a real <label> with an input whose visible affordance is a placeholder
   (see proposals.tsx, treasury.tsx). Standard clip technique, not display:none
   (which screen readers also skip). */
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
*{margin:0;padding:0;box-sizing:border-box}
body{background:var(--paper);color:var(--ink);font-family:'Newsreader',Georgia,serif;font-size:1.05rem;line-height:1.6;-webkit-font-smoothing:antialiased}
.sans{font-family:'Inter',system-ui,sans-serif}
header{border-bottom:1px solid var(--rule);background:rgba(250,247,242,.95);position:sticky;top:0;z-index:40}
.head-inner{max-width:76rem;margin:0 auto;padding:.8rem 1.2rem;display:flex;flex-wrap:wrap;align-items:center;gap:1rem;justify-content:space-between}
.brand{font-weight:600;font-size:1.05rem;text-decoration:none;color:var(--ink)}
.brand span{color:var(--accent)}
.brand-block{display:flex;flex-direction:column;line-height:1.2}
.brand-sub{font-family:'Inter',sans-serif;font-size:.62rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-faint)}
.whoami{font-family:'Inter',sans-serif;font-size:.8rem;color:var(--ink-soft);display:flex;align-items:center;gap:.6rem}
button,.btnlink{font-family:'Inter',sans-serif;font-size:.78rem;font-weight:600;letter-spacing:.02em;border:1px solid var(--rule);background:var(--card);color:var(--ink);padding:.45rem .8rem;border-radius:2px;cursor:pointer;text-decoration:none;display:inline-block}
button:hover,.btnlink:hover{border-color:var(--accent);color:var(--accent)}
button.primary,.btnlink.primary{background:var(--accent);border-color:var(--accent);color:var(--paper)}
button.primary:hover,.btnlink.primary:hover{background:#5e2222;color:var(--paper)}
select,input,textarea{font-family:'Inter',sans-serif;font-size:.85rem;padding:.45rem .6rem;border:1px solid var(--rule);border-radius:2px;background:#fff;color:var(--ink);width:100%}
nav.tabs{max-width:76rem;margin:0 auto;padding:0 1.2rem;display:flex;gap:.2rem;flex-wrap:wrap}
nav.tabs a{border:none;border-bottom:2px solid transparent;background:none;padding:.7rem .8rem;font-size:.78rem;letter-spacing:.05em;text-transform:uppercase;color:var(--ink-faint);text-decoration:none;font-family:'Inter',sans-serif}
nav.tabs a.active{color:var(--accent);border-bottom-color:var(--accent)}
main{max-width:76rem;margin:0 auto;padding:1.4rem 1.2rem 4rem}
.grid{display:grid;gap:1rem}
.cols2{grid-template-columns:repeat(auto-fit,minmax(320px,1fr))}
.card{background:var(--card);border:1px solid var(--rule);border-radius:2px;padding:1.1rem 1.2rem}
.card h3{font-size:1.15rem;font-weight:600;margin-bottom:.6rem}
.label{font-family:'Inter',sans-serif;font-size:.68rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--accent);display:block;margin-bottom:.35rem}
.muted{color:var(--ink-faint);font-size:.92rem}
.stat{font-size:1.7rem;font-weight:600;line-height:1.1}
.statrow{display:flex;gap:1.6rem;flex-wrap:wrap}
.bar{height:6px;background:var(--rule);border-radius:3px;overflow:hidden;margin-top:.3rem}
.bar i{display:block;height:100%;background:var(--accent)}
.row{display:flex;justify-content:space-between;gap:.8rem;padding:.5rem 0;border-bottom:1px solid var(--rule);align-items:baseline;flex-wrap:wrap}
.row:last-child{border-bottom:none}
.pill{font-family:'Inter',sans-serif;font-size:.66rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:.15rem .5rem;border-radius:2px;background:var(--accent-soft);color:var(--accent)}
.pill.green{background:#e6efe6;color:var(--good)}
.pill.gray{background:#eee9e0;color:var(--ink-faint)}
.log{font-family:'Inter',sans-serif;font-size:.8rem;color:var(--ink-soft)}
.log .row{padding:.4rem 0}
.formgrid{display:grid;gap:.6rem;margin-top:.6rem}
.footer-note{max-width:76rem;margin:0 auto;padding:1rem 1.2rem 2.5rem;font-size:.85rem;color:var(--ink-faint);font-style:italic}
h2.pagetitle{font-weight:600;font-size:1.5rem;margin:0 0 1rem}
.votebtns{display:flex;gap:.4rem}
.small{font-size:.8rem}
.ok{color:var(--good);font-weight:600}
.warn{color:var(--accent);font-weight:600}
.authcard{max-width:26rem;margin:3rem auto}
.error{color:var(--accent);font-family:'Inter',sans-serif;font-size:.85rem;margin-top:.5rem}
`;

const TABS: [string, string, string][] = [
  // /dashboard, not "/", so this tab reaches the app's dashboard on the
  // Triarc too (where "/" is now the Triarc's own landing page). Works
  // identically where "/" and /dashboard render the same thing.
  ["/dashboard", "dashboard", "Dashboard"],
  ["/proposals", "proposals", "Proposals"],
  ["/opportunities", "opportunities", "Opportunities"],
  ["/sectors", "sectors", "Sectors"],
  ["/delegation", "delegation", "Delegation"],
  ["/directory", "directory", "Directory"],
  ["/people", "people", "People"],
  ["/businesses", "businesses", "Businesses"],
  ["/contribution", "contribution", "Contribution"],
  ["/treasury", "treasury", "Treasury"],
  ["/disputes", "disputes", "Disputes"],
  ["/record", "record", "The Record"],
  ["/governance-health", "governance-health", "Governance Health"],
  ["/documents", "documents", "Documents"],
];

export const Layout: FC<
  PropsWithChildren<{
    title: string;
    tab?: string;
    member: { id: number; name: string; unreadCount?: number } | null;
    adminDebug?: boolean;
    // Per-deployment identity (Prompt24_PathA_PathB_Split.md) — this same
    // compiled code can serve more than one deployment as separate
    // Workers/D1 databases, so branding can't be a literal
    // string here; it has to come from the requesting deployment's own
    // communities.name row. Defaults to "The Triarc" only as a fallback for
    // the rare defensive render (index.tsx's error handlers) where the
    // community middleware may not have run yet.
    communityName?: string;
  }>
> = ({ title, tab, member, adminDebug, communityName = "The Triarc", children }) => (
  <html lang="en">
    <head>
      <meta charSet="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>{title} — {communityName} · Triarchal Framework</title>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600&family=Inter:wght@400;500;600;700&display=swap"
        rel="stylesheet"
      />
      <style>{STYLE}</style>
    </head>
    <body>
      {/* 2026-10-11 app views review — no page using Layout rendered a real
          <h1>: the visible page title is always h2.pagetitle, so a
          screen-reader user navigating by heading level never hit a level-1
          heading anywhere in the app. Visually hidden rather than styled, so
          the existing visual design (h2.pagetitle as the "real" look of a
          title) is untouched. theTriarc.tsx bypasses
          Layout entirely and already has its own visible <h1>. */}
      <h1 class="sr-only">{title}</h1>
      <header>
        <div class="head-inner">
          <div style="display:flex;align-items:center;gap:1rem;flex-wrap:wrap">
            <div class="brand-block">
              <a class="brand" href="/">
                {(() => {
                  // Cosmetic split for the accent-colored last word (matches
                  // the original "The <span>Triarc</span>" styling) — works
                  // for both "The Triarc" and any multi-word name alike.
                  const words = communityName.split(" ");
                  const last = words.pop();
                  return (
                    <>
                      {words.length ? words.join(" ") + " " : ""}
                      <span>{last}</span>
                    </>
                  );
                })()}
              </a>
              {/* communityName is the deployment/community you're in (The Triarc);
                  this line names the software the deployment
                  actually runs, so the app never reads as if it were itself
                  called "The Triarc" — see CLAUDE.md's naming split. */}
              <span class="brand-sub">Running Triarchal Framework</span>
            </div>
            <a class="btnlink" href="https://triarchal-democracy.vercel.app" target="_blank" rel="noopener">
              What is Triarchal Democracy? ↗
            </a>
          </div>
          <div class="whoami">
            {member && adminDebug && (
              <div role="group" aria-label="Developer clock controls — local testing only, never available in a real deployment" style="display:contents">
                <span class="pill gray">DEV CLOCK</span>
                <form method="post" action="/admin/advance" style="display:inline">
                  <input type="hidden" name="days" value="1" />
                  <button type="submit">+1 day</button>
                </form>
                <form method="post" action="/admin/advance" style="display:inline">
                  <input type="hidden" name="days" value="7" />
                  <button type="submit">+1 week</button>
                </form>
                <form method="post" action="/admin/advance" style="display:inline">
                  <input type="hidden" name="days" value="30" />
                  <button type="submit">+1 month</button>
                </form>
                <a class="btnlink" href="/admin/switch">
                  Switch member
                </a>
              </div>
            )}
            {member ? (
              <>
                <a class="btnlink" href="/search">
                  Search
                </a>
                <a class="btnlink" href="/notifications/inbox">
                  Inbox
                  {!!member.unreadCount && (
                    <span class="pill" style="margin-left:.35rem" aria-label={`${member.unreadCount} unread`}>
                      {member.unreadCount}
                    </span>
                  )}
                </a>
                <a href={`/profile/${member.id}`}>Signed in as {member.name}</a>
                <form method="post" action="/logout" style="display:inline">
                  <button type="submit">Sign out</button>
                </form>
              </>
            ) : (
              <a class="btnlink" href="/login">
                Sign in
              </a>
            )}
          </div>
        </div>
        {tab && (
          <nav class="tabs" aria-label="Main">
            {TABS.map(([href, key, label]) => (
              <a href={href} class={tab === key ? "active" : ""} aria-current={tab === key ? "page" : undefined}>
                {label}
              </a>
            ))}
          </nav>
        )}
      </header>
      <main>{children}</main>
      <p class="footer-note">
        One member, one vote, always. Delegation is public, revocable, and renews annually —{" "}
        {DEFAULT_PARAMS.delegationExpiryCriticalDays} days for critical decisions (Charter amendments, Entrenched
        amendments, Position decisions, large Treasury allocations).
        Contribution earns Marks; Marks earn dividends, capped at a multiple of the equal share (Charter 5.3). Every action lands in the permanent
        record. Where does it fail? {communityName} is a community governed under Triarchal Democracy, running on
        Triarchal Framework, the open-source platform the Triarc builds and stewards.
      </p>
    </body>
  </html>
);

export function critBar(label: string, have: number, need: number) {
  const pct = Math.min(100, Math.round((have / need) * 100));
  return (
    <div style="margin-bottom:.7rem">
      <div class="row" style="border:none;padding:.1rem 0">
        <span class="small sans">{label}</span>
        <span class="small sans">
          <b>{have}</b> / {need}
        </span>
      </div>
      <div class="bar">
        <i style={`width:${pct}%`}></i>
      </div>
    </div>
  );
}
