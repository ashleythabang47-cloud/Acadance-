import { useCallback, useEffect, useRef, useState } from "react";
import { Timer, Play, Pause, RotateCcw, X, Coffee, Brain } from "lucide-react";
import { api } from "../api/client";
import { useToast } from "../context/ToastContext";
import { OPEN_TIMER_EVENT } from "./CommandPalette";
import { todayKey } from "../utils/academics";

type Mode = "focus" | "short" | "long";

const DURATIONS: Record<Mode, number> = { focus: 25 * 60, short: 5 * 60, long: 15 * 60 };
const LABELS: Record<Mode, string> = { focus: "Focus", short: "Short break", long: "Long break" };
const STORAGE_KEY = "acadance_focus_timer";

interface TimerState {
  mode: Mode;
  /** epoch ms when the running timer ends; null when paused/idle */
  endsAt: number | null;
  /** seconds left when paused */
  remaining: number;
  completedDate: string;
  completedToday: number;
}

function load(): TimerState {
  const fallback: TimerState = { mode: "focus", endsAt: null, remaining: DURATIONS.focus, completedDate: todayKey(), completedToday: 0 };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = { ...fallback, ...(JSON.parse(raw) as Partial<TimerState>) };
    if (!(parsed.mode in DURATIONS)) parsed.mode = "focus";
    if (parsed.completedDate !== todayKey()) {
      parsed.completedDate = todayKey();
      parsed.completedToday = 0;
    }
    return parsed;
  } catch {
    return fallback;
  }
}

function save(state: TimerState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable — the timer still works for this page view */
  }
}

function chime() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [660, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = "sine";
      const t = ctx.currentTime + i * 0.22;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.55);
    });
    setTimeout(() => void ctx.close(), 1200);
  } catch {
    /* audio not available */
  }
}

const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

// A Pomodoro-style focus timer that floats on every student page. State
// lives in localStorage (as an end timestamp) so it keeps counting while
// you move between pages. Finishing a focus block counts toward the streak.
export default function FocusTimer() {
  const toast = useToast();
  const [state, setState] = useState<TimerState>(load);
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const completingRef = useRef(false);

  const running = state.endsAt !== null;
  const secondsLeft = running ? Math.max(0, Math.ceil((state.endsAt! - now) / 1000)) : state.remaining;
  const total = DURATIONS[state.mode];
  const progress = 1 - secondsLeft / total;

  const update = useCallback((next: TimerState) => {
    setState(next);
    save(next);
  }, []);

  useEffect(() => {
    const openIt = () => setOpen(true);
    window.addEventListener(OPEN_TIMER_EVENT, openIt);
    return () => window.removeEventListener(OPEN_TIMER_EVENT, openIt);
  }, []);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [running]);

  // Completion
  useEffect(() => {
    if (!running || secondsLeft > 0 || completingRef.current) return;
    completingRef.current = true;
    const finishedFocus = state.mode === "focus";
    const completedToday = finishedFocus ? state.completedToday + 1 : state.completedToday;
    const nextMode: Mode = finishedFocus ? (completedToday % 4 === 0 ? "long" : "short") : "focus";
    update({ ...state, mode: nextMode, endsAt: null, remaining: DURATIONS[nextMode], completedToday, completedDate: todayKey() });
    chime();
    if (finishedFocus) {
      toast.success(`Focus block complete — ${completedToday} today. Time for a ${nextMode === "long" ? "long" : "short"} break.`);
      api.post("/streaks/checkin").catch(() => {});
    } else {
      toast.info("Break's over — ready for another focus block?");
    }
    completingRef.current = false;
  }, [running, secondsLeft, state, update, toast]);

  // Show the countdown in the tab title while running.
  useEffect(() => {
    if (!running) return;
    const original = document.title;
    document.title = `${fmt(secondsLeft)} · ${LABELS[state.mode]} — Acadance`;
    return () => {
      document.title = original;
    };
  }, [running, secondsLeft, state.mode]);

  function start() {
    setNow(Date.now());
    update({ ...state, endsAt: Date.now() + secondsLeft * 1000 });
  }
  function pause() {
    update({ ...state, endsAt: null, remaining: secondsLeft });
  }
  function reset() {
    update({ ...state, endsAt: null, remaining: DURATIONS[state.mode] });
  }
  function switchMode(mode: Mode) {
    update({ ...state, mode, endsAt: null, remaining: DURATIONS[mode] });
  }

  const r = 54;
  const c = 2 * Math.PI * r;

  return (
    <div className={`focus-timer ${open ? "open" : ""}`}>
      {open && (
        <div className="focus-panel" role="dialog" aria-label="Focus timer">
          <div className="focus-panel-head">
            <span><Timer size={15} /> Focus timer</span>
            <button type="button" className="focus-icon-btn" onClick={() => setOpen(false)} aria-label="Close focus timer"><X size={15} /></button>
          </div>
          <div className="focus-modes" role="group" aria-label="Timer mode">
            {(Object.keys(DURATIONS) as Mode[]).map((m) => (
              <button key={m} type="button" className={state.mode === m ? "active" : ""} aria-pressed={state.mode === m} onClick={() => switchMode(m)}>
                {LABELS[m]}
              </button>
            ))}
          </div>
          <div className={`focus-dial mode-${state.mode}`}>
            <svg viewBox="0 0 128 128" width="168" height="168" aria-hidden="true">
              <circle cx="64" cy="64" r={r} className="focus-dial-track" />
              <circle
                cx="64"
                cy="64"
                r={r}
                className="focus-dial-arc"
                strokeDasharray={c}
                strokeDashoffset={c * (1 - progress)}
                transform="rotate(-90 64 64)"
              />
            </svg>
            <div className="focus-dial-center">
              {state.mode === "focus" ? <Brain size={16} /> : <Coffee size={16} />}
              <strong className="mono" aria-live="off">{fmt(secondsLeft)}</strong>
              <span>{LABELS[state.mode]}</span>
            </div>
          </div>
          <div className="focus-controls">
            {running ? (
              <button type="button" className="focus-primary" onClick={pause}><Pause size={15} /> Pause</button>
            ) : (
              <button type="button" className="focus-primary" onClick={start}><Play size={15} /> {secondsLeft < total ? "Resume" : "Start"}</button>
            )}
            <button type="button" className="focus-icon-btn" onClick={reset} aria-label="Reset timer" title="Reset"><RotateCcw size={15} /></button>
          </div>
          <div className="focus-tally" aria-label={`${state.completedToday} focus blocks completed today`}>
            {Array.from({ length: Math.max(4, state.completedToday) }, (_, i) => (
              <span key={i} className={i < state.completedToday ? "done" : ""} />
            ))}
            <small>{state.completedToday} today · finishing a focus block counts toward your streak</small>
          </div>
        </div>
      )}
      <button
        type="button"
        className={`focus-fab ${running ? "running" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Hide focus timer" : "Show focus timer"}
        aria-expanded={open}
      >
        <Timer size={18} />
        {running && <span className="mono">{fmt(secondsLeft)}</span>}
      </button>
    </div>
  );
}
