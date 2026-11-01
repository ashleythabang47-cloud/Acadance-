import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import BarField from "../components/BarField";
import Spinner from "../components/Spinner";

interface ApiError {
  response?: { data?: { message?: string } };
}

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const email = searchParams.get("email") ?? "";
  const deliveryPending = searchParams.get("delivery") === "pending";
  const navigationMessage = (location.state as { message?: unknown } | null)?.message;
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(
    typeof navigationMessage === "string"
      ? navigationMessage
      : deliveryPending
        ? "Your account was created. You can request a verification code below."
        : ""
  );
  const [resendSeconds, setResendSeconds] = useState(deliveryPending ? 0 : 60);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const timer = window.setTimeout(() => setResendSeconds((seconds) => seconds - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [resendSeconds]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    setLoading(true);
    try {
      await api.post("/auth/verify-otp", { email, otp });
      navigate("/login", {
        replace: true,
        state: { message: "Email verified. You can now log in." },
      });
    } catch (requestError) {
      setError((requestError as ApiError).response?.data?.message ?? "Could not verify the code. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    setError("");
    setNotice("");
    setResending(true);
    try {
      const response = await api.post("/auth/resend-otp", { email });
      setNotice(response.data.message ?? "If the account can receive a code, one has been sent.");
      setResendSeconds(60);
    } catch (requestError) {
      setError((requestError as ApiError).response?.data?.message ?? "Could not send a new code. Please try again later.");
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-brand-panel">
        <BarField />
        <div className="wordmark">Acadance</div>
        <div className="tagline">
          <h2>One more step.</h2>
          <p>Verify your email address to keep your account secure.</p>
        </div>
      </div>
      <div className="auth-form-panel">
        <form className="auth-card" onSubmit={(event) => void submit(event)}>
          <p className="eyebrow">Email verification</p>
          <h1>Check your inbox</h1>
          <p className="subtitle">Enter the 6-digit code sent to {email || "your email address"}.</p>
          {error && <div className="error-banner" role="alert">{error}</div>}
          {notice && <div className="verification-notice" role="status">{notice}</div>}
          <label htmlFor="verification-code">Verification code</label>
          <input
            id="verification-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            value={otp}
            onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
            required
            aria-label="6-digit verification code"
          />
          <button type="submit" disabled={loading || otp.length !== 6 || !email}>
            {loading ? <Spinner label="Verifying..." /> : "Verify email"}
          </button>
          <button
            className="secondary-auth-button"
            type="button"
            disabled={resending || resendSeconds > 0 || !email}
            onClick={() => void resend()}
          >
            {resending ? "Sending..." : resendSeconds > 0 ? `Resend code in ${resendSeconds}s` : "Resend code"}
          </button>
          <p className="switch-link"><Link to="/login">Back to login</Link></p>
        </form>
      </div>
    </div>
  );
}
