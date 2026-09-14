import type { AuthProvider } from "../../shared/auth";

export default function AuthProviderButton({
  provider,
  label = `Continue with ${provider === "apple" ? "Apple" : "Google"}`,
  disabled = false,
  onClick,
}: {
  provider: AuthProvider;
  label?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`auth-provider-button auth-provider-${provider}`}
      disabled={disabled}
      onClick={onClick}
    >
      {provider === "apple" && (
        <img src="/apple-logo-left-white-medium.svg" alt="" />
      )}
      <span>{label}</span>
    </button>
  );
}
