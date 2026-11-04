import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { UserPlus } from "lucide-react";
import { api } from "../api/client";
import BarField from "../components/BarField";
import AuthFeatures from "../components/AuthFeatures";
import Spinner from "../components/Spinner";
import PasswordField from "../components/PasswordField";
import { getPasswordStrength } from "../../../backend/src/utils/passwordStrength";
import { validateEmail, validateName } from "../utils/inputValidation";

export default function Register() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [serverFieldError, setServerFieldError] = useState<{ field: string; message: string } | null>(null);
  const navigate = useNavigate();
  const strength = getPasswordStrength(password, { email, name: fullName });
  const passwordsMatch = password.length > 0 && password === confirmPassword;
  const nameResult = validateName(fullName);
  const emailResult = validateEmail(email);
  const nameError = (submitted || fullName.length > 0) ? nameResult.error?.message : undefined;
  const emailError = (submitted || email.length > 0) ? emailResult.error?.message : undefined;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    setError("");
    setServerFieldError(null);
    if (nameResult.error || emailResult.error) return;
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (strength.level === "weak") {
      setError("Choose a stronger password before continuing.");
      return;
    }
    setLoading(true);
    try {
      await api.post("/auth/register", { fullName: nameResult.value, email: emailResult.value, password, confirmPassword });
      navigate(`/verify-email?email=${encodeURIComponent(emailResult.value)}`);
    } catch (err: any) {
      if (err.response?.data?.field && err.response?.data?.message) {
        setServerFieldError({ field: err.response.data.field, message: err.response.data.message });
      }
      if (err.response?.data?.emailVerificationRequired) {
        navigate(`/verify-email?email=${encodeURIComponent(emailResult.value)}&delivery=pending`, {
          state: { message: err.response.data.message },
        });
        return;
      }
      setError(err.response?.data?.message || "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-brand-panel">
        <BarField />
        <div className="wordmark"><span className="wordmark-mark" aria-hidden="true"><i /><i /><i /></span>Acadance</div>
        <div className="tagline">
          <h2>Every session adds a beat.</h2>
          <p>
            Set up your profile and start building a study rhythm the AI can
            actually learn from.
          </p>
        </div>
        <AuthFeatures />
      </div>

      <div className="auth-form-panel">
        <form className="auth-card" onSubmit={handleSubmit}>
          <p className="eyebrow">Create account</p>
          <h1>Join Acadance</h1>
          <p className="subtitle">Start tracking your academic progress</p>

          {error && <div className="error-banner">{error}</div>}

          <label htmlFor="register-name">Full name</label>
          <input
            id="register-name"
            type="text"
            value={fullName}
            onChange={(e) => { setFullName(e.target.value); setServerFieldError(null); }}
            required
            placeholder="Your full name"
            aria-invalid={Boolean(nameError || serverFieldError?.field === "fullName")}
            aria-describedby={nameError || serverFieldError?.field === "fullName" ? "register-name-error" : undefined}
          />
          {(nameError || (serverFieldError?.field === "fullName" && serverFieldError.message)) && (
            <p id="register-name-error" className="field-error" role="alert">{serverFieldError?.field === "fullName" ? serverFieldError.message : nameError}</p>
          )}

          <label htmlFor="register-email">Email</label>
          <input
            id="register-email"
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setServerFieldError(null); }}
            required
            placeholder="you@example.com"
            maxLength={254}
            aria-invalid={Boolean(emailError || serverFieldError?.field === "email")}
            aria-describedby={emailError || serverFieldError?.field === "email" ? "register-email-error" : undefined}
          />
          {(emailError || (serverFieldError?.field === "email" && serverFieldError.message)) && (
            <p id="register-email-error" className="field-error" role="alert">{serverFieldError?.field === "email" ? serverFieldError.message : emailError}</p>
          )}

          <PasswordField
            id="register-password"
            label="Password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            context={{ email, name: fullName }}
            showStrength
          />
          <PasswordField
            id="register-confirm-password"
            label="Confirm password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            autoComplete="new-password"
          />
          {confirmPassword && (
            <p className={`password-match ${passwordsMatch ? "password-match-ok" : "password-match-error"}`} role="status">
              {passwordsMatch ? "Passwords match" : "Passwords do not match"}
            </p>
          )}

          <button type="submit" disabled={loading || !passwordsMatch || strength.level === "weak"}>
            {loading ? <Spinner label="Creating account..." /> : <><UserPlus size={16} /> Register</>}
          </button>

          <p className="switch-link">
            Already have an account? <Link to="/login">Log in</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
