import type { ReactNode } from "react";
import Navbar from "./Navbar";
import AnnouncementFeed from "./AnnouncementFeed";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="page-shell">
      <Navbar />
      <AnnouncementFeed />
      <main className="main-content">{children}</main>
    </div>
  );
}
