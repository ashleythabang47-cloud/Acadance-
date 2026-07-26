import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Spinner from "./components/Spinner";
// Login/Register stay eagerly loaded — they're the first thing an
// unauthenticated visitor sees, and they're lightweight (no charts,
// no sockets), so there's nothing to gain by splitting them out.
import Login from "./pages/Login";
import Register from "./pages/Register";
import "./index.css";

// Everything past the login wall is lazy-loaded. These pages pull in
// heavier dependencies (Recharts, Socket.IO, Lucide icon sets) that a
// brand-new visitor doesn't need to download before they've even logged
// in — this is what actually shrinks the initial bundle.
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Performance = lazy(() => import("./pages/Performance"));
const Streak = lazy(() => import("./pages/Streak"));
const StudySessions = lazy(() => import("./pages/StudySessions"));
const StudyRoom = lazy(() => import("./pages/StudyRoom"));
const Quizzes = lazy(() => import("./pages/Quizzes"));
const TakeQuiz = lazy(() => import("./pages/TakeQuiz"));
const Profile = lazy(() => import("./pages/Profile"));

function PageFallback() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
      <Spinner label="Loading..." />
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Suspense fallback={<PageFallback />}>
            <Routes>
              <Route path="/" element={<Navigate to="/login" replace />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <Dashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/performance"
                element={
                  <ProtectedRoute>
                    <Performance />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/streak"
                element={
                  <ProtectedRoute>
                    <Streak />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/study-sessions"
                element={
                  <ProtectedRoute>
                    <StudySessions />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/study-sessions/:id"
                element={
                  <ProtectedRoute>
                    <StudyRoom />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/quizzes"
                element={
                  <ProtectedRoute>
                    <Quizzes />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/quizzes/:id"
                element={
                  <ProtectedRoute>
                    <TakeQuiz />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/profile"
                element={
                  <ProtectedRoute>
                    <Profile />
                  </ProtectedRoute>
                }
              />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
