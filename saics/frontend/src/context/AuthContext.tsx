import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";

interface Student {
  studentId: number;
  fullName: string;
  email: string;
}

interface AuthContextType {
  student: Student | null;
  login: (student: Student, token: string) => void;
  logout: () => void;
  updateStudentInfo: (partial: Partial<Student>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [student, setStudent] = useState<Student | null>(() => {
    const stored = localStorage.getItem("saics_student");
    return stored ? JSON.parse(stored) : null;
  });

  function login(student: Student, token: string) {
    localStorage.setItem("saics_token", token);
    localStorage.setItem("saics_student", JSON.stringify(student));
    setStudent(student);
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
      const updated = { ...prev, ...partial };
      localStorage.setItem("saics_student", JSON.stringify(updated));
      return updated;
    });
  }

  return (
    <AuthContext.Provider value={{ student, login, logout, updateStudentInfo }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
