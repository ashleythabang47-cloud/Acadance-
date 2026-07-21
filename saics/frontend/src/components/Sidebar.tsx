import { useNavigate, useLocation } from "react-router-dom";

const navItems = [
  { label: "Dashboard", path: "/dashboard", enabled: true },
  { label: "Performance", path: "/performance", enabled: true },
  { label: "Quizzes", path: "/quizzes", enabled: false },
  { label: "Study Sessions", path: "/study-sessions", enabled: true },
  { label: "Streak", path: "/streak", enabled: true },
];

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <aside className="sidebar">
      <div className="wordmark">Acadance</div>
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
    </aside>
  );
}
