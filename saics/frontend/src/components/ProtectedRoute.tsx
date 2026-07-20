import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import type { ReactNode } from "react";

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { student } = useAuth();
  if (!student) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}
