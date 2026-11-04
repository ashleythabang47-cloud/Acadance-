import type { ReactNode } from "react";
import Navbar from "./Navbar";
import AnnouncementFeed from "./AnnouncementFeed";
import CommandPalette from "./CommandPalette";
import FocusTimer from "./FocusTimer";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="page-shell">
      <div className="ambient-glow" aria-hidden="true" />
      <Navbar />
      <AnnouncementFeed />
      <main className="main-content">{children}</main>
      <CommandPalette />
      <FocusTimer />
    </div>
  );
}
