// Triarc Membership Code 2.1 (Prompt25_PathA_MembershipEnforcement.md Part
// C) — the phone-verification flow. The Triarc only; index.tsx's routes
// 404 this entirely when REQUIRE_PHONE_VERIFICATION is unset. Calm, factual
// status language throughout — Rules of Procedure 4.3's no-manufactured-
// urgency rule, same discipline already applied to Contribution Mark
// claiming.
import { Layout } from "./layout";

export type VerifyPhoneStatus =
  | { kind: "verified" }
  | { kind: "awaiting-code"; phone: string }
  | { kind: "start" };

export const VerifyPhonePage = (p: {
  member: { id: number; name: string; unreadCount?: number };
  adminDebug: boolean;
  communityName: string;
  status: VerifyPhoneStatus;
  error?: string;
}) => (
  <Layout title="Phone verification" member={p.member} adminDebug={p.adminDebug} communityName={p.communityName}>
    <h2 class="pagetitle">Phone verification</h2>
    <div class="card" style="max-width:32rem">
      <p class="muted small" style="margin-bottom:.8rem">
        Triarc Membership Code 2.1 — {p.communityName} requires a unique, verified phone number before an account can
        vote, delegate, or receive a delegation. Reading, deliberating, following sectors, and logging contributions
        all work already, with or without this. Your number is never shown on your profile or in the public record
        (2.1/3.3) — it's used only to confirm this account is a real, distinct person.
      </p>
      {p.error && <p class="error" style="margin-bottom:.8rem">{p.error}</p>}

      {p.status.kind === "verified" && <p class="ok">Your phone is verified. You're a full Member — voting and delegation are open to you.</p>}

      {p.status.kind === "awaiting-code" && (
        <>
          <p class="small" style="margin-bottom:.6rem">
            A code was sent by SMS to {p.status.phone}. Enter it below.
          </p>
          <form method="post" action="/verify-phone/confirm" class="formgrid">
            <label class="sr-only" for="verify-code">Verification code</label>
            <input id="verify-code" name="code" placeholder="6-digit code" inputmode="numeric" autocomplete="one-time-code" required />
            <button class="primary" type="submit">
              Confirm code
            </button>
          </form>
          <p class="muted small" style="margin-top:.6rem">
            Wrong number, or the code expired?{" "}
            <form method="post" action="/verify-phone/start" style="display:inline">
              <label class="sr-only" for="verify-phone-retry">Phone number</label>
              <input id="verify-phone-retry" name="phone" placeholder="+15195551234" style="width:auto;display:inline;margin:0 .3rem" />
              <button type="submit">Send a new code</button>
            </form>
          </p>
        </>
      )}

      {p.status.kind === "start" && (
        <form method="post" action="/verify-phone/start" class="formgrid">
          <label class="sr-only" for="verify-phone">Phone number</label>
          <input id="verify-phone" name="phone" placeholder="+15195551234 (E.164 format)" required />
          <button class="primary" type="submit">
            Send code
          </button>
        </form>
      )}
    </div>
  </Layout>
);
