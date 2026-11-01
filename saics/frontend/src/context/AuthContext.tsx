import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";

export type UserRole = "student" | "admin";

interface Student {
  studentId: number;
  fullName: string;
  email: string;
  avatarUrl?: string | null;
  avatarColor?: string;
  role: UserRole;
  forcePasswordReset: boolean;
  force_password_reset?: boolean;
}

interface AuthContextType {
  student: Student | null;
  forcePasswordReset: boolean;
  login: (
    student: Omit<Student, "role" | "forcePasswordReset"> & {
      role?: UserRole;
      forcePasswordReset?: boolean;
      force_password_reset?: boolean;
    },
    token: string,
    role?: UserRole,
    forcePasswordReset?: boolean,
  ) => void;
  completePasswordChange: (token?: string) => void;
  logout: () => void;
  updateStudentInfo: (partial: Partial<Student>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [student, setStudent] = useState<Student | null>(() => {
    const stored = localStorage.getItem("saics_student");
    if (!stored) return null;
    try {
      const parsed = JSON.parse(stored) as Partial<Student>;
      return {
        ...parsed,
        role: parsed.role === "admin" ? "admin" : "student",
        forcePasswordReset: parsed.forcePasswordReset === true || parsed.force_password_reset === true,
      } as Student;
    } catch {
      localStorage.removeItem("saics_student");
      return null;
    }
  });

  function login(
    user: Omit<Student, "role" | "forcePasswordReset"> & {
      role?: UserRole;
      forcePasswordReset?: boolean;
      force_password_reset?: boolean;
    },
    token: string,
    payloadRole?: UserRole,
    payloadForcePasswordReset?: boolean,
  ) {
    const student: Student = {
      ...user,
      role: payloadRole ?? user.role ?? "student",
      forcePasswordReset: payloadForcePasswordReset ?? user.forcePasswordReset ?? user.force_password_reset ?? false,
    };
    localStorage.setItem("saics_token", token);
    localStorage.setItem("saics_student", JSON.stringify(student));
    setStudent(student);
  }

  function completePasswordChange(token?: string) {
    if (token) localStorage.setItem("saics_token", token);
    setStudent((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, forcePasswordReset: false, force_password_reset: false };
      localStorage.setItem("saics_student", JSON.stringify(updated));
      return updated;
    });
  }

  function logout() {
    localStorage.removeItem("saics_token");
    localStorage.removeItem("saics_student");
    setStudent(null);
  }

  // Call this whenever profile fields change elsewhere (e.g. the Profile
  // page) so the name shown in the sidebar/dashboard/topbar stays in sync
  // without requiring a full re-login.
  function updateStudentInfo(partial: Partial<Student>) {
    setStudent((prev) => {
      if (!prev) return prev;
      const updated = {
        ...prev,
        ...partial,
        ...(partial.forcePasswordReset !== undefined ? { force_password_reset: partial.forcePasswordReset } : {}),
      };
      localStorage.setItem("saics_student", JSON.stringify(updated));
      return updated;
    });
  }

  return (
    <AuthContext.Provider value={{ student, forcePasswordReset: student?.forcePasswordReset ?? false, login, completePasswordChange, logout, updateStudentInfo }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
