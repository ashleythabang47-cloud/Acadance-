import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import type { ReactNode } from "react";

export default function ProtectedRoute({
  children,
  requireAdmin = false,
  allowPasswordChange = false,
}: {
  children: ReactNode;
  requireAdmin?: boolean;
  allowPasswordChange?: boolean;
}) {
  const { student, forcePasswordReset } = useAuth();
  if (!student) {
    return <Navigate to="/login" replace />;
  }
  if (requireAdmin && student.role !== "admin") {
    return <Navigate to="/dashboard" replace />;
  }
  if (forcePasswordReset && !allowPasswordChange) {
    return <Navigate to="/change-password" replace />;
  }
  return <>{children}</>;
}
