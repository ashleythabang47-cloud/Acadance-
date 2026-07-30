import type { ReactNode } from "react";
import Navbar from "./Navbar";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="page-shell">
      <Navbar />
      <main className="main-content">{children}</main>
    </div>
  );
}
