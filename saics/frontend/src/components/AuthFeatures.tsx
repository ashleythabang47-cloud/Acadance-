import { LineChart, Sparkles, Mic, Flame } from "lucide-react";

const FEATURES = [
  { icon: LineChart, title: "Insightful analytics", text: "Trends, subject strengths and an explainable risk outlook." },
  { icon: Sparkles, title: "AI quizzes", text: "Turn any notes into graded practice in seconds." },
  { icon: Mic, title: "Voice study rooms", text: "Revise together with classmates, live." },
  { icon: Flame, title: "Streaks & focus", text: "Build a daily rhythm with streaks and a focus timer." },
];

export default function AuthFeatures() {
  return (
    <ul className="auth-features">
      {FEATURES.map(({ icon: Icon, title, text }) => (
        <li key={title}>
          <span className="auth-feature-icon"><Icon size={16} /></span>
          <div>
            <strong>{title}</strong>
            <span>{text}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
