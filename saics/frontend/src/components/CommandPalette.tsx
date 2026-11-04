import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import {
  Search,
  LayoutDashboard,
  LineChart,
  BookOpenCheck,
  Mic,
  Flame,
  UserCircle,
  PlusCircle,
  Sparkles,
  Timer,
  SunMoon,
  LogOut,
  CornerDownLeft,
} from "lucide-react";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";

interface Command {
  id: string;
  label: string;
  group: "Go to" | "Actions";
  icon: LucideIcon;
  keywords?: string;
  run: () => void;
}

export const OPEN_PALETTE_EVENT = "acadance:open-command-palette";
export const OPEN_TIMER_EVENT = "acadance:open-focus-timer";

// Ctrl/⌘ + K quick switcher — jump anywhere or fire common actions
// without reaching for the mouse.
export default function CommandPalette() {
  const navigate = useNavigate();
  const { toggleTheme } = useTheme();
  const { logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands = useMemo<Command[]>(() => {
    const go = (path: string, state?: unknown) => () => navigate(path, state ? { state } : undefined);
    return [
      { id: "dash", label: "Dashboard", group: "Go to", icon: LayoutDashboard, keywords: "home overview", run: go("/dashboard") },
      { id: "perf", label: "Performance", group: "Go to", icon: LineChart, keywords: "results marks grades chart", run: go("/performance") },
      { id: "quiz", label: "Quizzes", group: "Go to", icon: BookOpenCheck, keywords: "ai test practice", run: go("/quizzes") },
      { id: "study", label: "Study sessions", group: "Go to", icon: Mic, keywords: "voice room collaborate", run: go("/study-sessions") },
      { id: "streak", label: "Streak", group: "Go to", icon: Flame, keywords: "activity heatmap", run: go("/streak") },
      { id: "profile", label: "Profile", group: "Go to", icon: UserCircle, keywords: "account avatar subjects", run: go("/profile") },
      { id: "add-result", label: "Log a new result", group: "Actions", icon: PlusCircle, keywords: "add score assessment", run: go("/performance", { focusForm: true }) },
      { id: "gen-quiz", label: "Generate an AI quiz", group: "Actions", icon: Sparkles, keywords: "create new quiz", run: go("/quizzes", { focusForm: true }) },
      { id: "timer", label: "Open focus timer", group: "Actions", icon: Timer, keywords: "pomodoro concentrate", run: () => window.dispatchEvent(new Event(OPEN_TIMER_EVENT)) },
      { id: "theme", label: "Toggle light / dark mode", group: "Actions", icon: SunMoon, keywords: "theme appearance", run: toggleTheme },
      { id: "logout", label: "Log out", group: "Actions", icon: LogOut, keywords: "sign out", run: () => { logout(); navigate("/login"); } },
    ];
  }, [navigate, toggleTheme, logout]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => `${c.label} ${c.keywords ?? ""}`.toLowerCase().includes(q));
  }, [commands, query]);

  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    const openIt = () => setOpen(true);
    document.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_PALETTE_EVENT, openIt);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_PALETTE_EVENT, openIt);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => setIndex(0), [query]);

  if (!open) return null;

  function run(cmd: Command | undefined) {
    if (!cmd) return;
    setOpen(false);
    cmd.run();
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndex((i) => (filtered.length ? (i + 1) % filtered.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndex((i) => (filtered.length ? (i - 1 + filtered.length) % filtered.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      run(filtered[index]);
    }
  }

  let lastGroup = "";
  return (
    <div className="palette-backdrop" onMouseDown={() => setOpen(false)}>
      <div
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="palette-search">
          <Search size={17} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search pages and actions…"
            aria-label="Search commands"
            aria-controls="palette-list"
            aria-activedescendant={filtered[index] ? `palette-${filtered[index].id}` : undefined}
          />
          <kbd>Esc</kbd>
        </div>
        <ul className="palette-list" id="palette-list" role="listbox">
          {filtered.length === 0 && <li className="palette-empty">No matches for “{query}”.</li>}
          {filtered.map((cmd, i) => {
            const Icon = cmd.icon;
            const header = cmd.group !== lastGroup ? cmd.group : null;
            lastGroup = cmd.group;
            return (
              <li key={cmd.id} role="presentation">
                {header && <p className="palette-group">{header}</p>}
                <button
                  id={`palette-${cmd.id}`}
                  type="button"
                  role="option"
                  aria-selected={i === index}
                  className={`palette-item ${i === index ? "active" : ""}`}
                  onMouseEnter={() => setIndex(i)}
                  onClick={() => run(cmd)}
                >
                  <span className="palette-item-icon"><Icon size={16} /></span>
                  {cmd.label}
                  {i === index && <CornerDownLeft size={14} className="palette-enter" />}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="palette-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span><kbd>↵</kbd> open</span>
          <span><kbd>Ctrl</kbd><kbd>K</kbd> toggle</span>
        </div>
      </div>
    </div>
  );
}
