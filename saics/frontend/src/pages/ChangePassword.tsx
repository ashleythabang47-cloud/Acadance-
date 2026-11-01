import { useState } from "react";
import type { FormEvent } from "react";
import { KeyRound } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import Spinner from "../components/Spinner";
import PasswordField from "../components/PasswordField";
import { getPasswordStrength } from "../../../backend/src/utils/passwordStrength";

export default function ChangePassword() {
  const { student, completePasswordChange } = useAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const strength = getPasswordStrength(newPassword, { email: student?.email, name: student?.fullName });
  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) {
      setError("The new passwords do not match.");
      return;
    }
    if (currentPassword === newPassword) {
      setError("Choose a password different from your current password.");
      return;
    }
    if (strength.level === "weak") {
      setError("Choose a stronger password.");
      return;
    }
    setLoading(true);
    try {
      const response = await api.post("/auth/change-password", { currentPassword, newPassword, confirmPassword });
      const token = response.data.token ?? response.data.accessToken ?? response.data.access_token;
      completePasswordChange(typeof token === "string" ? token : undefined);
      navigate(student?.role === "admin" ? "/admin" : "/dashboard", { replace: true });
    } catch (err) {
      const requestError = err as { response?: { data?: { message?: string } } };
      setError(requestError.response?.data?.message ?? "Could not update your password. Check your current password and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="password-gate-shell">
      <form className="password-gate-card" onSubmit={(event) => void submit(event)}>
        <div className="password-gate-icon"><KeyRound size={22} /></div>
        <p className="eyebrow">SECURITY UPDATE</p>
        <h1>Choose a new password</h1>
        <p className="subtitle">For your security, update your password before continuing to Acadance.</p>
        {error && <div className="error-banner" role="alert">{error}</div>}
        <PasswordField id="current-password" label="Current password" autoComplete="current-password" value={currentPassword} onChange={setCurrentPassword} />
        <PasswordField id="new-password" label="New password" autoComplete="new-password" value={newPassword} onChange={setNewPassword} context={{ email: student?.email, name: student?.fullName }} showStrength />
        <PasswordField id="confirm-password" label="Confirm new password" autoComplete="new-password" value={confirmPassword} onChange={setConfirmPassword} />
        {confirmPassword && (
          <p className={`password-match ${passwordsMatch ? "password-match-ok" : "password-match-error"}`} role="status">
            {passwordsMatch ? "Passwords match" : "Passwords do not match"}
          </p>
        )}
        <button type="submit" disabled={loading || !passwordsMatch || strength.level === "weak"}>{loading ? <Spinner label="Updating password..." /> : "Update password"}</button>
      </form>
    </div>
  );
}
