import { Layout } from "./layout";

export const LoginPage = (props: { error?: string; communityName: string }) => (
  <Layout title="Sign in" member={null} communityName={props.communityName}>
    <div class="card authcard">
      <h2 class="pagetitle">Sign in to {props.communityName}</h2>
      <form method="post" action="/login" class="formgrid">
        <label class="sr-only" for="login-email">Email</label>
        <input id="login-email" type="email" name="email" placeholder="Email" required />
        <label class="sr-only" for="login-password">Password</label>
        <input id="login-password" type="password" name="password" placeholder="Password" required />
        <button class="primary" type="submit">
          Sign in
        </button>
      </form>
      {props.error && <p class="error">{props.error}</p>}
      <p class="muted small" style="margin-top:1rem">
        No account yet? <a href="/register">Affirm the charter and join</a>.
      </p>
    </div>
  </Layout>
);

export const RegisterPage = (props: { error?: string; communityName: string; requirePhoneVerification: boolean }) => (
  <Layout title="Join" member={null} communityName={props.communityName}>
    <div class="card authcard">
      <h2 class="pagetitle">Join {props.communityName}</h2>
      <p class="muted small" style="margin-bottom:.8rem">
        Anyone aged 18 or older may become a Member by creating a verified account and affirming the charter (Article I.1). One
        member, one vote — always.
        {props.requirePhoneVerification &&
          " Voting and delegation additionally require a verified phone number (Triarc Membership Code 2.1) — you can do that next, or any time from your profile; it never blocks creating your account."}
      </p>
      <form method="post" action="/register" class="formgrid">
        <label class="sr-only" for="register-name">Username</label>
        <input id="register-name" type="text" name="name" placeholder="Username (3-20 chars: letters, numbers, _ or -)" pattern="[a-zA-Z0-9_-]{3,20}" required />
        <label class="sr-only" for="register-email">Email</label>
        <input id="register-email" type="email" name="email" placeholder="Email (private — never published)" required />
        <label class="sr-only" for="register-password">Password</label>
        <input id="register-password" type="password" name="password" placeholder="Password (min. 8 characters)" minlength={8} required />
        <label for="register-age" class="small sans" style="display:flex;gap:.5rem;align-items:flex-start;margin:.2rem 0">
          <input id="register-age" type="checkbox" name="minimumAge" style="margin-top:.2rem" required />
          <span>I am at least 18 years old. Members must be 18 or older; an account found to belong to someone younger is closed and its personal data deleted.</span>
        </label>
        {props.requirePhoneVerification && (
          <>
            <label class="sr-only" for="register-phone">Phone number (optional)</label>
            <input id="register-phone" type="tel" name="phone" placeholder="Phone (optional, +15195551234) — verify now or later" />
          </>
        )}
        <button class="primary" type="submit">
          Affirm the charter and join
        </button>
      </form>
      <p class="muted small" style="margin-top:.5rem">
        Your username is your public identity here — a handle, not your legal name. Article VII.2: your legal
        identity is never required or published; only what you do within the community is.
      </p>
      {props.error && <p class="error">{props.error}</p>}
      <p class="muted small" style="margin-top:1rem">
        Already a member? <a href="/login">Sign in</a>.
      </p>
    </div>
  </Layout>
);
