import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  LineChart,
  BookOpenCheck,
  Mic,
  Flame,
  UserCircle,
  Sun,
  Moon,
  Menu,
  X,
} from "lucide-react";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";

const API_ORIGIN = "http://localhost:5000";

const navItems = [
  { label: "Dashboard", path: "/dashboard", enabled: true, icon: LayoutDashboard },
  { label: "Performance", path: "/performance", enabled: true, icon: LineChart },
  { label: "Quizzes", path: "/quizzes", enabled: true, icon: BookOpenCheck },
  { label: "Study Sessions", path: "/study-sessions", enabled: true, icon: Mic },
  { label: "Streak", path: "/streak", enabled: true, icon: Flame },
  { label: "Profile", path: "/profile", enabled: true, icon: UserCircle },
];

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const { student } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const resolvedAvatarUrl = student?.avatarUrl ? `${API_ORIGIN}${student.avatarUrl}` : null;

  function go(path: string) {
    navigate(path);
    setMobileOpen(false);
  }

  return (
    <>
      {/* Only rendered/visible on small screens via CSS — opens the drawer */}
      <button
        className="mobile-menu-trigger"
        onClick={() => setMobileOpen(true)}
        aria-label="Open menu"
      >
        <Menu size={20} />
      </button>

      {/* Dims the page and closes the drawer when tapped, mobile only */}
      {mobileOpen && (
        <div className="mobile-backdrop" onClick={() => setMobileOpen(false)} />
      )}

      <aside className={`sidebar ${mobileOpen ? "mobile-open" : ""}`}>
        <div className="sidebar-top-row">
          <div className="wordmark">Acadance</div>
          <button
            className="mobile-close-trigger"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        </div>

        <button className="sidebar-profile-snippet" onClick={() => go("/profile")}>
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
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              location.pathname === item.path || location.pathname.startsWith(item.path + "/");
            return (
              <span
                key={item.path}
                className={`nav-item ${isActive ? "active" : ""} ${!item.enabled ? "disabled" : ""}`}
                onClick={() => item.enabled && go(item.path)}
                role="button"
              >
                <Icon size={17} strokeWidth={2} />
                {item.label}
              </span>
            );
          })}
        </nav>

        <button className="theme-toggle" onClick={toggleTheme} type="button">
          {theme === "dark" ? (
            <>
              <Sun size={16} />
              Light mode
            </>
          ) : (
            <>
              <Moon size={16} />
              Dark mode
            </>
          )}
        </button>
      </aside>
    </>
  );
}
