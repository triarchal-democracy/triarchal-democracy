// Twilio Verify — Prompt25_PathA_MembershipEnforcement.md Part A. Plain
// HTTPS API (Basic auth, form-encoded bodies), no SDK, same
// no-external-dependency approach as auth.ts and notify.ts. Twilio Verify
// itself generates, delivers, expires, and attempt-limits the OTP
// server-side — this file never sees or stores a code.
//
// Credentials are Worker secrets (`wrangler secret put ...`), set only on
// the Triarc's config — see wrangler.patha.toml. As of this
// build the founder hasn't created a Twilio account yet (Prompt25's Part A
// context), so every function below fails gracefully with a clear
// "temporarily unavailable" result — never a thrown error or a 500 — when
// any of the three secrets is absent, exactly mirroring notify.ts's
// RESEND_API_KEY-absent handling. See this file's own header comment in the
// final build report for the numbered Twilio setup steps.

export interface TwilioVerifyEnv {
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_VERIFY_SERVICE_SID?: string;
}

export type VerifyResult = { ok: true } | { ok: false; error: string };

const UNAVAILABLE_MESSAGE = "Phone verification is temporarily unavailable. Try again later.";

function credentialsPresent(env: TwilioVerifyEnv): env is Required<TwilioVerifyEnv> {
  return !!(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_VERIFY_SERVICE_SID);
}

function basicAuthHeader(sid: string, token: string): string {
  return `Basic ${btoa(`${sid}:${token}`)}`;
}

/** Twilio Verify's own {code, message} error body when present; a short generic fallback otherwise — never the raw response leaked to a caller. */
async function twilioErrorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string; code?: number };
    if (body?.message) return body.message;
  } catch {
    // non-JSON body — fall through to the generic message
  }
  return "The verification request could not be completed. Try again.";
}

/** Starts a Twilio Verify check — sends the OTP by SMS. Contribution/Deliberation logging etc. are untouched by this; it only ever gates voting/delegation (Triarc Membership Code 2.1). */
export async function startPhoneVerification(env: TwilioVerifyEnv, phoneE164: string): Promise<VerifyResult> {
  if (!credentialsPresent(env)) {
    console.warn("[twilioVerify] Twilio credentials not set — verification start unavailable");
    return { ok: false, error: UNAVAILABLE_MESSAGE };
  }
  try {
    const res = await fetch(`https://verify.twilio.com/v2/Services/${env.TWILIO_VERIFY_SERVICE_SID}/Verifications`, {
      method: "POST",
      headers: {
        Authorization: basicAuthHeader(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: phoneE164, Channel: "sms" }).toString(),
    });
    if (!res.ok) {
      const msg = await twilioErrorMessage(res);
      console.warn(`[twilioVerify] start failed for a phone number (status ${res.status}): ${msg}`);
      return { ok: false, error: msg };
    }
    return { ok: true };
  } catch (err) {
    console.warn("[twilioVerify] start threw:", err);
    return { ok: false, error: UNAVAILABLE_MESSAGE };
  }
}

/** Confirms a Twilio Verify check against the code the member entered. Only "approved" counts as success — "pending" (wrong code) and everything else are treated as a rejected attempt, not an error. */
export async function checkPhoneVerification(env: TwilioVerifyEnv, phoneE164: string, code: string): Promise<VerifyResult> {
  if (!credentialsPresent(env)) {
    console.warn("[twilioVerify] Twilio credentials not set — verification check unavailable");
    return { ok: false, error: UNAVAILABLE_MESSAGE };
  }
  try {
    const res = await fetch(`https://verify.twilio.com/v2/Services/${env.TWILIO_VERIFY_SERVICE_SID}/VerificationCheck`, {
      method: "POST",
      headers: {
        Authorization: basicAuthHeader(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: phoneE164, Code: code }).toString(),
    });
    if (!res.ok) {
      const msg = await twilioErrorMessage(res);
      console.warn(`[twilioVerify] check failed for a phone number (status ${res.status}): ${msg}`);
      return { ok: false, error: msg };
    }
    const body = (await res.json()) as { status?: string };
    if (body.status === "approved") return { ok: true };
    return { ok: false, error: "That code didn't match. Check the number and try again." };
  } catch (err) {
    console.warn("[twilioVerify] check threw:", err);
    return { ok: false, error: UNAVAILABLE_MESSAGE };
  }
}
