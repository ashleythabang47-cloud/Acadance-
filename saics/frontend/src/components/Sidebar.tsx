import { useNavigate, useLocation } from "react-router-dom";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";

const API_ORIGIN = "http://localhost:5000";

const navItems = [
  { label: "Dashboard", path: "/dashboard", enabled: true },
  { label: "Performance", path: "/performance", enabled: true },
  { label: "Quizzes", path: "/quizzes", enabled: true },
  { label: "Study Sessions", path: "/study-sessions", enabled: true },
  { label: "Streak", path: "/streak", enabled: true },
  { label: "Profile", path: "/profile", enabled: true },
];

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const { student } = useAuth();

  const resolvedAvatarUrl = student?.avatarUrl ? `${API_ORIGIN}${student.avatarUrl}` : null;

  return (
    <aside className="sidebar">
      <div className="wordmark">Acadance</div>

      <button className="sidebar-profile-snippet" onClick={() => navigate("/profile")}>
        {resolvedAvatarUrl ? (
          <img src={resolvedAvatarUrl} alt="" className="sidebar-avatar-img" />
        ) : (
          <div
            className="sidebar-avatar-fallback"
            style={{ background: student?.avatarColor || "#0e6e66" }}
          >
            {student?.fullName?.charAt(0).toUpperCase() || "?"}
          </div>
        )}
        <span className="sidebar-profile-name">{student?.fullName?.split(" ")[0]}</span>
      </button>

      <nav>
        {navItems.map((item) => (
          <span
            key={item.path}
            className={`nav-item ${
              location.pathname === item.path || location.pathname.startsWith(item.path + "/")
                ? "active"
                : ""
            } ${!item.enabled ? "disabled" : ""}`}
            onClick={() => item.enabled && navigate(item.path)}
            role="button"
          >
            {item.label}
          </span>
        ))}
      </nav>

      <button className="theme-toggle" onClick={toggleTheme} type="button">
        {theme === "dark" ? (
          <>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
            </svg>
            Light mode
          </>
        ) : (
          <>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
            Dark mode
          </>
        )}
      </button>
    </aside>
  );
}
