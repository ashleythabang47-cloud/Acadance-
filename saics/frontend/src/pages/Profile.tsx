import { useEffect, useRef, useState } from "react";
import type { FormEvent, ChangeEvent, DragEvent } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, Save, Trash2, Check } from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import Sidebar from "../components/Sidebar";
import Spinner from "../components/Spinner";

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
  avatar_url: string | null;
}

const AVATAR_COLORS = ["#0e6e66", "#e7a33e", "#b8542f", "#3d5a80", "#7b506f"];
const API_ORIGIN = "http://localhost:5000";
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

export default function Profile() {
  const { logout, updateStudentInfo } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

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
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

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
      setAvatarUrl(p.avatar_url);
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
      updateStudentInfo({ fullName, avatarColor });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err: any) {
      setError(err.response?.data?.message || "Could not save your profile.");
    } finally {
      setSaving(false);
    }
  }

  function validateAndUpload(file: File) {
    setError("");
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      setError("Please upload a JPEG, PNG, or WEBP image.");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setError("Image must be smaller than 2MB.");
      return;
    }
    uploadAvatar(file);
  }

  async function uploadAvatar(file: File) {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("avatar", file);
      const res = await api.post("/students/me/avatar", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setAvatarUrl(res.data.avatarUrl);
      updateStudentInfo({ avatarUrl: res.data.avatarUrl });
    } catch (err: any) {
      setError(err.response?.data?.message || "Could not upload your photo.");
    } finally {
      setUploading(false);
    }
  }

  async function handleRemovePhoto() {
    setError("");
    try {
      await api.delete("/students/me/avatar");
      setAvatarUrl(null);
      updateStudentInfo({ avatarUrl: null });
    } catch (err) {
      console.error(err);
      setError("Could not remove your photo.");
    }
  }

  function handleFileInputChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) validateAndUpload(file);
    e.target.value = ""; // allow re-selecting the same file later
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) validateAndUpload(file);
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

  const resolvedAvatarUrl = avatarUrl ? `${API_ORIGIN}${avatarUrl}` : null;

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
            <LogOut size={15} />
            Log out
          </button>
        </header>

        {error && <div className="error-banner" style={{ marginBottom: 20 }}>{error}</div>}

        {loading ? (
          <Spinner label="Loading your profile..." />
        ) : (
          <div className="profile-layout">
            <div className="card profile-photo-card">
              <div
                className={`avatar-dropzone ${dragActive ? "drag-active" : ""}`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleDrop}
                role="button"
              >
                {resolvedAvatarUrl ? (
                  <img src={resolvedAvatarUrl} alt="Your profile" className="avatar-image" />
                ) : (
                  <div className="avatar-circle profile-avatar" style={{ background: avatarColor }}>
                    {fullName.charAt(0).toUpperCase()}
                  </div>
                )}

                <div className="avatar-overlay">
                  {uploading ? (
                    <span>Uploading...</span>
                  ) : (
                    <>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                        <circle cx="12" cy="13" r="4" />
                      </svg>
                      <span>Change photo</span>
                    </>
                  )}
                </div>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileInputChange}
                hidden
              />

              <h3 style={{ margin: "16px 0 2px" }}>{fullName}</h3>
              <p style={{ margin: 0, color: "var(--ink-soft)", fontSize: 13.5 }}>
                {profile?.email}
              </p>
              {academicYear && (
                <p style={{ margin: "6px 0 0", color: "var(--ink-soft)", fontSize: 13 }}>
                  {academicYear}
                </p>
              )}

              {resolvedAvatarUrl && (
                <button type="button" className="remove-photo-link" onClick={handleRemovePhoto}>
                  <Trash2 size={12} />
                  Remove photo
                </button>
              )}

              {!resolvedAvatarUrl && (
                <>
                  <p className="avatar-color-label">No photo yet — pick a color instead</p>
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
                </>
              )}
            </div>

            <div className="profile-main-col">
              <div className="card" style={{ marginBottom: 24 }}>
                <h3>Basic details</h3>
                <form onSubmit={handleSave} className="performance-form" style={{ marginTop: 16 }}>
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

                  <button type="submit" disabled={saving}>
                    {saving ? (
                      <Spinner label="Saving..." />
                    ) : saved ? (
                      <>
                        <Check size={15} />
                        Saved
                      </>
                    ) : (
                      <>
                        <Save size={15} />
                        Save changes
                      </>
                    )}
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
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
