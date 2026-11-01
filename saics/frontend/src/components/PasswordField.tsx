import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { getPasswordStrength } from "../../../backend/src/utils/passwordStrength";

interface PasswordFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  context?: { email?: string; name?: string };
  showStrength?: boolean;
}

export default function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  context,
  showStrength = false,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const strength = getPasswordStrength(value, context);

  return (
    <div className="password-field">
      <label htmlFor={id}>{label}</label>
      <div className="password-input-row">
        <input
          id={id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required
        />
        <button
          className="password-visibility-toggle"
          type="button"
          aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`}
          aria-pressed={visible}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
      {showStrength && value && (
        <div className={`password-strength password-strength-${strength.level}`}>
          <div
            className="password-strength-track"
            role="meter"
            aria-label="Password strength"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={strength.percent}
          >
            <span style={{ width: `${strength.percent}%` }} />
          </div>
          <p>{strength.label}</p>
          {strength.hints.length > 0 && <small>{strength.hints.join(" · ")}</small>}
        </div>
      )}
    </div>
  );
}
