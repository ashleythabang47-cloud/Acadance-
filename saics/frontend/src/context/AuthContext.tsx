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

  return (
    <AuthContext.Provider value={{ student, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
