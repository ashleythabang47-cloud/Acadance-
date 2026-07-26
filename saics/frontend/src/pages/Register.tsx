import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { UserPlus } from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import BarField from "../components/BarField";
import Spinner from "../components/Spinner";

export default function Register() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await api.post("/auth/register", { fullName, email, password });
      login(res.data.student, res.data.token);
      navigate("/dashboard");
    } catch (err: any) {
      setError(err.response?.data?.message || "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-brand-panel">
        <BarField />
        <div className="wordmark">Acadance</div>
        <div className="tagline">
          <h2>Every session adds a beat.</h2>
          <p>
            Set up your profile and start building a study rhythm the AI can
            actually learn from.
          </p>
        </div>
      </div>

      <div className="auth-form-panel">
        <form className="auth-card" onSubmit={handleSubmit}>
          <p className="eyebrow">Create account</p>
          <h1>Join Acadance</h1>
          <p className="subtitle">Start tracking your academic progress</p>

          {error && <div className="error-banner">{error}</div>}

          <label>Full name</label>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            placeholder="Your full name"
          />

          <label>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="you@example.com"
          />

          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            placeholder="At least 8 characters"
          />

          <button type="submit" disabled={loading}>
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
