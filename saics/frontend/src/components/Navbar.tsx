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
  ChevronDown,
  LogOut,
} from "lucide-react";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import NotificationBell from "./NotificationBell";
import { handleKeyActivation } from "../utils/a11y";

const API_ORIGIN = "http://localhost:5000";

// Core, everyday workflow — the horizontal nav links.
const navItems = [
  { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
  { label: "Performance", path: "/performance", icon: LineChart },
  { label: "Quizzes", path: "/quizzes", icon: BookOpenCheck },
  { label: "Study Sessions", path: "/study-sessions", icon: Mic },
];

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const { student, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  const resolvedAvatarUrl = student?.avatarUrl ? `${API_ORIGIN}${student.avatarUrl}` : null;

  function go(path: string) {
    navigate(path);
    setMobileOpen(false);
    setProfileMenuOpen(false);
  }

  function handleLogout() {
    logout();
    navigate("/login");
  }

  // Close the profile dropdown on an outside click or Escape.
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) {
        setProfileMenuOpen(false);
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setProfileMenuOpen(false);
    }
    if (profileMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEscape);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [profileMenuOpen]);

  // Close the mobile menu on Escape too.
  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setMobileOpen(false);
    }
    if (mobileOpen) document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [mobileOpen]);

  function isActivePath(path: string) {
    return location.pathname === path || location.pathname.startsWith(path + "/");
  }

  return (
    <header className="navbar">
      <div className="navbar-inner">
        <div className="navbar-left">
          <div className="wordmark">Acadance</div>

          <nav className="navbar-links">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <span
                  key={item.path}
                  className={`navbar-link ${isActivePath(item.path) ? "active" : ""}`}
                  onClick={() => go(item.path)}
                  onKeyDown={handleKeyActivation(() => go(item.path))}
                  role="button"
                  tabIndex={0}
                >
                  <Icon size={16} strokeWidth={2} />
                  {item.label}
                </span>
              );
            })}
          </nav>
        </div>

        <div className="navbar-right">
          <NotificationBell />

          <button
            className="icon-toggle-btn"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
          </button>

          <div className="profile-menu-wrapper" ref={profileMenuRef}>
            <button
              className="navbar-profile-trigger"
              onClick={() => setProfileMenuOpen((prev) => !prev)}
              aria-haspopup="true"
              aria-expanded={profileMenuOpen}
              aria-label={`Account menu for ${student?.fullName || "your account"}`}
            >
              {resolvedAvatarUrl ? (
                <img src={resolvedAvatarUrl} alt="" className="navbar-avatar-img" />
              ) : (
                <div
                  className="navbar-avatar-fallback"
                  style={{ background: student?.avatarColor || "#4f46e5" }}
                >
                  {student?.fullName?.charAt(0).toUpperCase() || "?"}
                </div>
              )}
              <span className="navbar-profile-name">{student?.fullName?.split(" ")[0]}</span>
              <ChevronDown
                size={15}
                className={`profile-chevron ${profileMenuOpen ? "flipped" : ""}`}
              />
            </button>

            {profileMenuOpen && (
              <div className="profile-dropdown-menu" role="menu">
                <button
                  className={`profile-dropdown-item ${isActivePath("/profile") ? "active" : ""}`}
                  onClick={() => go("/profile")}
                  role="menuitem"
                >
                  <UserCircle size={16} />
                  Profile
                </button>
                <button
                  className={`profile-dropdown-item ${isActivePath("/streak") ? "active" : ""}`}
                  onClick={() => go("/streak")}
                  role="menuitem"
                >
                  <Flame size={16} />
                  Streak
                </button>
                <div className="profile-dropdown-divider" />
                <button
                  className="profile-dropdown-item logout"
                  onClick={handleLogout}
                  role="menuitem"
                >
                  <LogOut size={16} />
                  Log out
                </button>
              </div>
            )}
          </div>

          {/* Mobile-only hamburger, opens the nav links as a dropdown sheet */}
          <button
            className="mobile-menu-trigger"
            onClick={() => setMobileOpen((prev) => !prev)}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <>
          <div className="mobile-backdrop" onClick={() => setMobileOpen(false)} />
          <nav className="mobile-nav-sheet">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <span
                  key={item.path}
                  className={`mobile-nav-item ${isActivePath(item.path) ? "active" : ""}`}
                  onClick={() => go(item.path)}
                  onKeyDown={handleKeyActivation(() => go(item.path))}
                  role="button"
                  tabIndex={0}
                >
                  <Icon size={17} strokeWidth={2} />
                  {item.label}
                </span>
              );
            })}
          </nav>
        </>
      )}
    </header>
  );
}
