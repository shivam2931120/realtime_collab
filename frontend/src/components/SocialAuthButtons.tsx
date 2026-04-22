import { useSignIn, useSignUp } from "@clerk/clerk-react";

type SocialAuthButtonsProps = {
  mode: "login" | "register";
};

const clerkEnabled = Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);

const DisabledButtons = () => (
  <div className="grid grid-cols-2 gap-4">
    {["Google", "GitHub"].map((label) => (
      <button
        key={label}
        type="button"
        disabled
        className="flex items-center justify-center gap-2 rounded border border-outline-variant/10 bg-surface-container-low py-2.5 opacity-60"
      >
        <span className="material-symbols-outlined text-base text-white">
          {label === "Google" ? "public" : "code"}
        </span>
        <span className="text-xs font-bold uppercase tracking-tight text-white">{label}</span>
      </button>
    ))}
    <p className="col-span-2 text-center text-[11px] text-on-surface-variant">
      Add `VITE_CLERK_PUBLISHABLE_KEY` to enable Google and GitHub auth.
    </p>
  </div>
);

const EnabledButtons = ({ mode }: SocialAuthButtonsProps) => {
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();

  const handleSocialClick = async (strategy: "oauth_google" | "oauth_github") => {
    const authFlow = mode === "register" ? signUp : signIn;

    if (!authFlow) {
      return;
    }

    await authFlow.authenticateWithRedirect({
      strategy,
      redirectUrl: "/sso-callback",
      redirectUrlComplete: "/auth/sync",
    });
  };

  return (
    <div className="grid grid-cols-2 gap-4">
      <button
        type="button"
        onClick={() => handleSocialClick("oauth_google")}
        className="flex items-center justify-center gap-2 rounded border border-outline-variant/10 bg-surface-container-low py-2.5 transition-colors hover:bg-surface-container-high"
      >
        <span className="material-symbols-outlined text-base text-white">public</span>
        <span className="text-xs font-bold uppercase tracking-tight text-white">Google</span>
      </button>
      <button
        type="button"
        onClick={() => handleSocialClick("oauth_github")}
        className="flex items-center justify-center gap-2 rounded border border-outline-variant/10 bg-surface-container-low py-2.5 transition-colors hover:bg-surface-container-high"
      >
        <span className="material-symbols-outlined text-base text-white">code</span>
        <span className="text-xs font-bold uppercase tracking-tight text-white">GitHub</span>
      </button>
    </div>
  );
};

const SocialAuthButtons = ({ mode }: SocialAuthButtonsProps) => {
  if (!clerkEnabled) {
    return <DisabledButtons />;
  }

  return <EnabledButtons mode={mode} />;
};

export default SocialAuthButtons;
