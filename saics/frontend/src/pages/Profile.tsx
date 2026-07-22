import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import Sidebar from "../components/Sidebar";

interface Subject {
  subject_id: number;
  subject_name: string;
}

interface StudentProfile {
  student_id: number;
  full_name: string;
  email: string;
  bio: string | null;
  academic_year: string | null;
  avatar_color: string;
}

const AVATAR_COLORS = ["#0e6e66", "#e7a33e", "#b8542f", "#3d5a80", "#7b506f"];

export default function Profile() {
  const { logout, updateStudentInfo } = useAuth();
  const navigate = useNavigate();

  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [allSubjects, setAllSubjects] = useState<Subject[]>([]);
  const [enrolledIds, setEnrolledIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const [fullName, setFullName] = useState("");
  const [bio, setBio] = useState("");
  const [academicYear, setAcademicYear] = useState("");
  const [avatarColor, setAvatarColor] = useState(AVATAR_COLORS[0]);

  async function loadData() {
    setLoading(true);
    try {
      const [profileRes, subjectsRes] = await Promise.all([
        api.get("/students/me"),
        api.get("/subjects"),
      ]);
      const p: StudentProfile = profileRes.data.student;
      setProfile(p);
      setFullName(p.full_name);
      setBio(p.bio || "");
      setAcademicYear(p.academic_year || "");
      setAvatarColor(p.avatar_color || AVATAR_COLORS[0]);
      setAllSubjects(subjectsRes.data.subjects);
      setEnrolledIds(
        new Set(profileRes.data.enrolledSubjects.map((s: Subject) => s.subject_id))
      );
    } catch (err) {
      console.error(err);
      setError("Could not load your profile.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSaved(false);
    setSaving(true);
    try {
      await api.put("/students/me", {
        fullName,
        bio,
        academicYear,
        avatarColor,
      });
      updateStudentInfo({ fullName });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err: any) {
      setError(err.response?.data?.message || "Could not save your profile.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleSubject(subjectId: number) {
    const isEnrolled = enrolledIds.has(subjectId);
    try {
      if (isEnrolled) {
        await api.delete(`/students/me/subjects/${subjectId}`);
        setEnrolledIds((prev) => {
          const next = new Set(prev);
          next.delete(subjectId);
          return next;
        });
      } else {
        await api.post("/students/me/subjects", { subjectId });
        setEnrolledIds((prev) => new Set(prev).add(subjectId));
      }
    } catch (err) {
      console.error(err);
      setError("Could not update your subjects.");
    }
  }

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <div className="app-shell">
      <Sidebar />

      <div className="main-content">
        <header className="topbar">
          <div>
            <p className="greeting-eyebrow">Your account</p>
            <h1>Profile</h1>
          </div>
          <button className="logout-btn" onClick={handleLogout}>
            Log out
          </button>
        </header>

        {error && <div className="error-banner" style={{ marginBottom: 20 }}>{error}</div>}

        {loading ? (
          <p>Loading...</p>
        ) : (
          <>
            <div className="card" style={{ marginBottom: 24 }}>
              <div className="profile-header">
                <div className="avatar-circle profile-avatar" style={{ background: avatarColor }}>
                  {fullName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 style={{ margin: 0 }}>{fullName}</h3>
                  <p style={{ margin: "4px 0 0", color: "var(--ink-soft)", fontSize: 13.5 }}>
                    {profile?.email}
                  </p>
                </div>
              </div>

              <form onSubmit={handleSave} className="performance-form" style={{ marginTop: 24 }}>
                <div className="form-row">
                  <div>
                    <label>Full name</label>
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label>Academic year</label>
                    <input
                      type="text"
                      value={academicYear}
                      onChange={(e) => setAcademicYear(e.target.value)}
                      placeholder="e.g. Final year"
                    />
                  </div>
                </div>

                <label>Bio</label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="A short line about yourself or what you're studying"
                  rows={3}
                  maxLength={255}
                />

                <label>Avatar color</label>
                <div className="avatar-color-picker">
                  {AVATAR_COLORS.map((color) => (
                    <button
                      type="button"
                      key={color}
                      className={`color-swatch ${avatarColor === color ? "selected" : ""}`}
                      style={{ background: color }}
                      onClick={() => setAvatarColor(color)}
                      aria-label={`Choose color ${color}`}
                    />
                  ))}
                </div>

                <button type="submit" disabled={saving}>
                  {saving ? "Saving..." : saved ? "Saved ✓" : "Save changes"}
                </button>
              </form>
            </div>

            <div className="card">
              <h3>Enrolled subjects</h3>
              <p style={{ marginTop: -4, marginBottom: 16, fontSize: 13, color: "var(--ink-soft)" }}>
                Toggle the subjects you're currently taking.
              </p>
              <div className="subject-toggle-grid">
                {allSubjects.map((s) => (
                  <button
                    type="button"
                    key={s.subject_id}
                    className={`subject-toggle ${
                      enrolledIds.has(s.subject_id) ? "enrolled" : ""
                    }`}
                    onClick={() => toggleSubject(s.subject_id)}
                  >
                    {s.subject_name}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
