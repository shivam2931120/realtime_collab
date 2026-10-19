type GoogleButtonProps = {
  unavailable?: boolean;
  disabled?: boolean;
  busy?: boolean;
  onClick?: () => void;
};

export function GoogleButton({ unavailable = false, disabled = false, busy = false, onClick }: GoogleButtonProps) {
  return (
    <div className="auth-google-action">
      <button
        type="button"
        className="auth-google-button"
        disabled={unavailable || disabled || busy}
        aria-describedby={unavailable ? "google-setup-note" : undefined}
        onClick={onClick}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.01v2.5h3.24c1.9-1.75 2.98-4.33 2.98-7.34Z" />
          <path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.62-2.43l-3.24-2.5c-.9.6-2.05.96-3.38.96-2.6 0-4.81-1.76-5.6-4.12H3.05v2.59A10 10 0 0 0 12 22Z" />
          <path fill="#FBBC05" d="M6.4 13.91A6 6 0 0 1 6.09 12c0-.66.11-1.3.31-1.91V7.5H3.05A10 10 0 0 0 2 12c0 1.61.39 3.14 1.05 4.5l3.35-2.59Z" />
          <path fill="#EA4335" d="M12 5.97c1.47 0 2.79.51 3.82 1.51l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.95 5.5l3.35 2.59C7.19 7.73 9.4 5.97 12 5.97Z" />
        </svg>
        {busy ? "Connecting to Google…" : "Continue with Google"}
      </button>
      {unavailable ? <p id="google-setup-note" className="auth-google-note">Google sign-in is being set up. You can use email below.</p> : null}
    </div>
  );
}
