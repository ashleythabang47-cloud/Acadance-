import { useEffect, useRef, useState } from "react";
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
  ChevronUp,
} from "lucide-react";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import NotificationBell from "./NotificationBell";

const API_ORIGIN = "http://localhost:5000";

// Core, everyday workflow — stays visible in the main nav list.
const navItems = [
  { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
  { label: "Performance", path: "/performance", icon: LineChart },
  { label: "Quizzes", path: "/quizzes", icon: BookOpenCheck },
  { label: "Study Sessions", path: "/study-sessions", icon: Mic },
];

// Secondary/account-ish items — tucked into the profile dropdown instead
// of taking up permanent space in the nav list.
const profileMenuItems = [
  { label: "Profile", path: "/profile", icon: UserCircle },
  { label: "Streak", path: "/streak", icon: Flame },
];

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const { student } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  const resolvedAvatarUrl = student?.avatarUrl ? `${API_ORIGIN}${student.avatarUrl}` : null;

  function go(path: string) {
    navigate(path);
    setMobileOpen(false);
    setProfileMenuOpen(false);
  }

  // Close the profile dropdown on an outside click.
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) {
        setProfileMenuOpen(false);
      }
    }
    if (profileMenuOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [profileMenuOpen]);

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
      {mobileOpen && <div className="mobile-backdrop" onClick={() => setMobileOpen(false)} />}

      <aside className={`sidebar ${mobileOpen ? "mobile-open" : ""}`}>
        <div className="sidebar-top-row">
          <div className="wordmark">Acadance</div>
          <div className="sidebar-top-actions">
            <NotificationBell />
            <button
              className="icon-toggle-btn"
              onClick={toggleTheme}
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <button
              className="mobile-close-trigger"
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <nav>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              location.pathname === item.path || location.pathname.startsWith(item.path + "/");
            return (
              <span
                key={item.path}
                className={`nav-item ${isActive ? "active" : ""}`}
                onClick={() => go(item.path)}
                role="button"
              >
                <Icon size={17} strokeWidth={2} />
                {item.label}
              </span>
            );
          })}
        </nav>

        {/* Bottom-pinned profile switcher — opens a dropdown upward for
            account-ish items instead of listing them permanently above. */}
        <div className="profile-menu-wrapper" ref={profileMenuRef}>
          {profileMenuOpen && (
            <div className="profile-dropdown-menu">
              {profileMenuItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                return (
                  <button
                    key={item.path}
                    className={`profile-dropdown-item ${isActive ? "active" : ""}`}
                    onClick={() => go(item.path)}
                  >
                    <Icon size={16} />
                    {item.label}
                  </button>
                );
              })}
            </div>
          )}

          <button
            className="sidebar-profile-snippet"
            onClick={() => setProfileMenuOpen((prev) => !prev)}
          >
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
            <ChevronUp
              size={15}
              className={`profile-chevron ${profileMenuOpen ? "flipped" : ""}`}
            />
          </button>
        </div>
      </aside>
    </>
  );
}
