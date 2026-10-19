import { useClerk, useSignIn, useSignUp } from "@clerk/react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { GoogleButton } from "./GoogleSignInButton";

type Mode = "login" | "register" | "reset";
type Step = "credentials" | "verify-email" | "verify-reset" | "new-password" | "verify-mfa";
type Result = { error: unknown };

function check(result: Result) {
  if (result.error) throw result.error;
}

function errorMessage(cause: unknown) {
  const error = cause as { code?: string; message?: string; longMessage?: string; errors?: { code?: string; longMessage?: string; message?: string }[] };
  const detail = error?.errors?.[0] ?? error;
  if (detail?.code === "form_identifier_not_found") {
    return "No account found for this email. Create an account or continue with Google to get started.";
  }
  return detail?.longMessage || detail?.message || "Something went wrong. Please try again.";
}

export default function ClerkAuthForm({ mode }: { mode: Mode }) {
  const clerk = useClerk();
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [mfa, setMfa] = useState<"email" | "phone" | "totp">("email");
  const [resendAt, setResendAt] = useState(0);
  const inFlight = useRef(false);
  const resumed = useRef(false);

  const run = async (action: () => Promise<void>, google = false) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setGoogleBusy(google);
    setError("");
    setNotice("");
    try { await action(); }
    catch (cause) { setError(errorMessage(cause)); }
    finally {
      inFlight.current = false;
      setBusy(false);
      setGoogleBusy(false);
    }
  };

  const finish = async (resource: typeof signIn | typeof signUp) => {
    check(await resource.finalize({ navigate: ({ session, decorateUrl }) => {
      const url = decorateUrl(session?.currentTask ? "/auth/tasks" : "/dashboard");
      if (url.startsWith("http")) window.location.assign(url);
      else navigate(url, { replace: true });
    } }));
  };

  const continueSignIn = async () => {
    if (signIn.status === "complete") return finish(signIn);
    if (signIn.status === "needs_new_password") {
      setPassword("");
      setStep("new-password");
      return;
    }
    if (signIn.status === "needs_second_factor" || signIn.status === "needs_client_trust") {
      const factors = signIn.supportedSecondFactors;
      if (factors.some(factor => factor.strategy === "email_code")) {
        check(await signIn.mfa.sendEmailCode());
        setMfa("email");
      } else if (factors.some(factor => factor.strategy === "totp")) {
        setMfa("totp");
      } else if (factors.some(factor => factor.strategy === "phone_code")) {
        check(await signIn.mfa.sendPhoneCode());
        setMfa("phone");
      } else throw new Error("This account requires another verification method. Please continue with Google.");
      setResendAt(Date.now() + 30000);
      setCode("");
      setPassword("");
      setStep("verify-mfa");
      return;
    }
    throw new Error("Sign-in needs another step. Please try again or continue with Google.");
  };

  useEffect(() => {
    if (resumed.current) return;
    resumed.current = true;
    // OAuth may return here when device verification is still required.
    if (mode === "login" && (signIn.status === "needs_client_trust" || signIn.status === "needs_second_factor")) {
      void run(continueSignIn);
    }
  }, [mode, signIn]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void run(async () => {
      if (step === "verify-email") {
        check(await signUp.verifications.verifyEmailCode({ code }));
        if (signUp.status === "complete") await finish(signUp);
        else throw new Error("Your account needs additional information. Please try creating your account again.");
      } else if (step === "verify-reset") {
        check(await signIn.resetPasswordEmailCode.verifyCode({ code }));
        setCode("");
        setPassword("");
        setStep("new-password");
      } else if (step === "new-password") {
        check(await signIn.resetPasswordEmailCode.submitPassword({ password, signOutOfOtherSessions: true }));
        await continueSignIn();
      } else if (step === "verify-mfa") {
        check(await (mfa === "totp" ? signIn.mfa.verifyTOTP({ code }) : mfa === "phone" ? signIn.mfa.verifyPhoneCode({ code }) : signIn.mfa.verifyEmailCode({ code })));
        await continueSignIn();
      } else if (mode === "register") {
        check(await signUp.password({ emailAddress: email.trim(), password }));
        if (signUp.status === "complete") await finish(signUp);
        else {
          check(await signUp.verifications.sendEmailCode());
          setResendAt(Date.now() + 30000);
          setPassword("");
          setStep("verify-email");
        }
      } else if (mode === "reset") {
        check(await signIn.create({ identifier: email.trim() }));
        check(await signIn.resetPasswordEmailCode.sendCode());
        setResendAt(Date.now() + 30000);
        setStep("verify-reset");
      } else {
        check(await signIn.password({ emailAddress: email.trim(), password }));
        await continueSignIn();
      }
    });
  };

  const google = () => void run(async () => {
    // Use the live client resource, since resetting a signal invalidates its old handle.
    await clerk.client.signIn.authenticateWithRedirect({
      strategy: "oauth_google",
      redirectUrlComplete: new URL("/auth/tasks", window.location.origin).href,
      redirectUrl: new URL("/sso-callback", window.location.origin).href,
    });
  }, true);

  const resend = () => void run(async () => {
    if (Date.now() < resendAt) {
      setNotice("Please wait 30 seconds between code requests.");
      return;
    }
    if (step === "verify-email") check(await signUp.verifications.sendEmailCode());
    else if (step === "verify-reset") check(await signIn.resetPasswordEmailCode.sendCode());
    else if (mfa === "phone") check(await signIn.mfa.sendPhoneCode());
    else check(await signIn.mfa.sendEmailCode());
    setResendAt(Date.now() + 30000);
    setNotice("A new verification code has been sent.");
  });

  const back = () => void run(async () => {
    check(await (mode === "register" ? signUp.reset() : signIn.reset()));
    setStep("credentials");
    setCode("");
    setPassword("");
  });

  const verifying = step.startsWith("verify-");
  const title = verifying ? "Check your code" : step === "new-password" ? "Choose a new password" : mode === "register" ? "Create your account" : mode === "reset" ? "Reset your password" : "Welcome back";
  const helper = verifying ? (mfa === "totp" && step === "verify-mfa" ? "Enter the code from your authenticator app." : `Enter the verification code sent to ${step === "verify-mfa" && mfa === "phone" ? "your phone" : email || "your email"}.`) : mode === "register" ? "Start writing, reviewing, and publishing together." : mode === "reset" ? "We’ll help you get back into your workspace." : "Sign in to your Editorial workspace.";
  const label = verifying ? "Verify and continue" : step === "new-password" ? "Update password" : mode === "register" ? "Create account" : mode === "reset" ? "Send reset code" : "Sign in";

  return <main className="auth-page">
    <section className="auth-card" aria-labelledby="auth-heading">
      <a href="/about.html" className="auth-brand"><img src="/logo.png" alt="" />Editorial</a>
      <h1 id="auth-heading">{title}</h1>
      <p className="auth-helper">{helper}</p>
      {step === "credentials" && mode !== "reset" && <>
        <GoogleButton busy={googleBusy} disabled={busy} onClick={google} />
        <div className="auth-divider"><span>or continue with email</span></div>
      </>}
      <form className="auth-form" onSubmit={submit} aria-busy={busy}>
        {step === "credentials" && <div>
          <label className="auth-label" htmlFor="auth-email">Email address</label>
          <input id="auth-email" className="auth-input" name="email" type="email" autoComplete="email" required value={email} disabled={busy} onChange={event => setEmail(event.target.value)} placeholder="you@company.com" />
        </div>}
        {(step === "new-password" || (step === "credentials" && mode !== "reset")) && <div>
          <label className="auth-label" htmlFor="auth-password">{step === "new-password" ? "New password" : "Password"}</label>
          <div className="auth-password-field">
            <input id="auth-password" className="auth-input" name="password" type={showPassword ? "text" : "password"} autoComplete={mode === "register" || step === "new-password" ? "new-password" : "current-password"} minLength={mode === "register" || step === "new-password" ? 8 : undefined} required value={password} disabled={busy} onChange={event => setPassword(event.target.value)} placeholder={mode === "register" ? "At least 8 characters" : "Enter your password"} />
            <button type="button" className="auth-password-toggle" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>{showPassword ? "Hide" : "Show"}</button>
          </div>
        </div>}
        {verifying && <div>
          <label className="auth-label" htmlFor="auth-code">Verification code</label>
          <input key={step} id="auth-code" className="auth-input" name="code" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required autoFocus value={code} disabled={busy} onChange={event => setCode(event.target.value)} placeholder="000000" />
        </div>}
        {error && <p className="auth-error" role="alert">{error}</p>}
        {notice && <p className="auth-helper" role="status">{notice}</p>}
        {mode === "login" && step === "credentials" && <Link className="auth-link auth-forgot" to="/reset-password">Forgot password?</Link>}
        <button type="submit" className="auth-primary-button" disabled={busy}>{busy ? "Please wait…" : label}</button>
      </form>
      {verifying && !(step === "verify-mfa" && mfa === "totp") && <button className="auth-link mt-4" type="button" disabled={busy} onClick={resend}>Send a new code</button>}
      {step !== "credentials" && <button className="auth-link auth-back" type="button" disabled={busy} onClick={back}>Start again</button>}
      <p className="auth-switch mt-6">{mode === "login" ? <>New to Editorial? <Link to="/register">Create account</Link></> : <>Already have an account? <Link to="/login">Sign in</Link></>}</p>
      <p className="auth-legal mt-6"><a href="/about.html">About</a><span aria-hidden="true"> · </span><a href="/privacy.html">Privacy Policy</a><span aria-hidden="true"> · </span><a href="/terms.html">Terms of Service</a></p>
      <div id="clerk-captcha" />
    </section>
  </main>;
}
