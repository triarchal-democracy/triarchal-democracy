import { Layout } from "./layout";

export const OnboardingSectorsPage = (p: {
  member: { id: number; name: string };
  adminDebug: boolean; communityName: string;
  sectors: { id: number; name: string }[];
}) => (
  <Layout title="Welcome" member={p.member} adminDebug={p.adminDebug} communityName={p.communityName}>
    <h2 class="pagetitle">Welcome, {p.member.name} — what are you interested in?</h2>
    <div class="card">
      <p class="muted small" style="margin-bottom:.8rem">
        Follow any sectors you care about — this seeds your personalized feed right away (Contribution Code 2.4).
        Free, no Mark, no standing, and you can change this any time from a sector's page. Skip if you'd rather
        decide later.
      </p>
      <form method="post" action="/onboarding/sectors">
        <div style="display:flex;gap:.8rem;flex-wrap:wrap;margin-bottom:1rem">
          {p.sectors.map((s) => (
            <label class="small sans" style="display:flex;gap:.3rem;align-items:center">
              <input type="checkbox" name="sectorId" value={s.id} /> {s.name}
            </label>
          ))}
        </div>
        <button class="primary" type="submit">
          Continue
        </button>
      </form>
    </div>
  </Layout>
);

export const OnboardingWalkthroughPage = (p: { member: { id: number; name: string }; adminDebug: boolean; communityName: string }) => (
  <Layout title="How this works" member={p.member} adminDebug={p.adminDebug} communityName={p.communityName}>
    <h2 class="pagetitle">Before you start — how voting and delegation work</h2>
    <div class="card" style="margin-bottom:1rem">
      <span class="label">Your vote</span>
      <p class="small">
        One Member, one vote, always — never weighted, never purchasable. Every binding decision is yours to cast
        directly, any time, on any open proposal.
      </p>
    </div>
    <div class="card" style="margin-bottom:1rem">
      <span class="label">Delegation</span>
      <p class="small">
        If you'd rather lend your vote to someone you trust on a topic — entirely, or scoped to just one sector —
        you can delegate it. It's public, it's revocable the instant you change your mind, and a direct vote from
        you always overrides it. Ordinary decisions renew delegation annually; the highest-stakes decisions (Charter
        amendments, Position decisions, large Treasury allocations) need a delegation renewed within the last 90
        days to count.
      </p>
    </div>
    <div class="card" style="margin-bottom:1rem">
      <span class="label">Everything is on the record</span>
      <p class="small">
        Every proposal, vote, delegation, and contribution lands on the permanent public Record. Nothing here
        happens quietly.
      </p>
    </div>
    <form method="post" action="/onboarding/complete">
      <button class="primary" type="submit">
        Continue to dashboard
      </button>
    </form>
  </Layout>
);
