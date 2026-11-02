import { useCallback, useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import {
  Activity, AlertTriangle, ArrowDownToLine, ArrowUpRight, Bot, BookOpen, Check, Database, FileText,
  ChevronRight, KeyRound, LayoutDashboard, LogOut, Megaphone, Moon, Plus, RefreshCw,
  Server, Sun, Trash2, Users, X,
} from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import Spinner from "../components/Spinner";
import AnnouncementFeed from "../components/AnnouncementFeed";
import { normalizeEmail, normalizeName, validateEmail, validateName } from "../utils/inputValidation";
import AdminReports from "./AdminReports";

type Row = Record<string, unknown>;

const navigation = [
  { label: "Dashboard", path: "/admin", icon: LayoutDashboard },
  { label: "At-Risk Students", path: "/admin/analytics", icon: AlertTriangle },
  { label: "Reports", path: "/admin/reports", icon: FileText },
  { label: "Users", path: "/admin/users", icon: Users },
  { label: "Activity Logs", path: "/admin/activity", icon: Activity },
  { label: "Content", path: "/admin/content", icon: BookOpen },
  { label: "AI Monitoring", path: "/admin/ai", icon: Bot },
  { label: "Backups", path: "/admin/backups", icon: Database },
  { label: "System", path: "/admin/system", icon: Server },
  { label: "Announcements", path: "/admin/announcements", icon: Megaphone },
];

function recordsFrom(data: unknown, ...keys: string[]): Row[] {
  if (Array.isArray(data)) return data as Row[];
  if (!data || typeof data !== "object") return [];
  const obj = data as Row;
  for (const key of [...keys, "data", "items", "results"]) {
    if (Array.isArray(obj[key])) return obj[key] as Row[];
  }
  return [];
}

function valueFor(row: Row, ...keys: string[]): string {
  const value = keys.map((key) => row[key]).find((item) => item !== undefined && item !== null);
  if (typeof value === "object") return JSON.stringify(value);
  return value === undefined ? "—" : String(value);
}

function displayDate(value: unknown): string {
  if (!value) return "—";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function AdminFrame({ children }: { children: ReactNode }) {
  const { student, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const current = navigation.find((item) => item.path === location.pathname) ?? navigation[0];
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <Link to="/admin" className="admin-brand"><span className="admin-brand-mark">a</span> acadance<span className="admin-brand-tag">ADMIN</span></Link>
        <div className="admin-side-label">WORKSPACE</div>
        <nav className="admin-nav" aria-label="Admin navigation">
          {navigation.map(({ label, path, icon: Icon }) => (
            <NavLink key={path} to={path} end={path === "/admin"} className={({ isActive }) => `admin-nav-link${isActive ? " active" : ""}`}>
              <Icon size={17} /> <span>{label}</span>{location.pathname === path && <ChevronRight className="admin-nav-chevron" size={15} />}
            </NavLink>
          ))}
        </nav>
        <div className="admin-sidebar-bottom">
          <div className="admin-account"><div className="admin-account-avatar">{student?.fullName?.charAt(0).toUpperCase() ?? "A"}</div><div><strong>{student?.fullName ?? "Administrator"}</strong><span>Administrator</span></div></div>
          <button className="admin-logout" onClick={() => { logout(); navigate("/login"); }}><LogOut size={16} /> Sign out</button>
        </div>
      </aside>
      <div className="admin-main">
        <header className="admin-topbar">
          <div className="admin-breadcrumb"><span>Admin</span><ChevronRight size={14} /><strong>{current.label}</strong></div>
          <div className="admin-top-actions"><span className="admin-live"><i /> Admin workspace</span><button className="icon-toggle-btn admin-theme-toggle" onClick={toggleTheme} aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}>{theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}</button></div>
        </header>
        <AnnouncementFeed />
        <main className="admin-content">{children}</main>
      </div>
    </div>
  );
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="admin-page-heading"><div><p className="admin-eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></div>{action}</div>;
}

function LoadPanel({ loading, error, empty, retry, children }: { loading: boolean; error: string; empty: boolean; retry: () => void; children: ReactNode }) {
  if (loading) return <div className="admin-panel admin-state"><Spinner label="Loading data..." /></div>;
  if (error) return <div className="admin-panel admin-state admin-error"><AlertTriangle size={20} /><p>{error}</p><button className="admin-button secondary" onClick={retry}><RefreshCw size={15} /> Try again</button></div>;
  if (empty) return <div className="admin-panel admin-state"><div className="admin-empty-icon"><Activity size={21} /></div><strong>Nothing to show yet</strong><p>When data is available, it will appear here.</p></div>;
  return <>{children}</>;
}

function useResource<T>(url: string, initial: T) {
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try { const response = await api.get(url); setData(response.data as T); }
    catch (err) {
      const requestError = err as { response?: { data?: { message?: string } } };
      setError(requestError.response?.data?.message ?? "Could not load this information. Please try again.");
    } finally { setLoading(false); }
  }, [url]);
  useEffect(() => { void reload(); }, [reload]);
  return { data, setData, loading, error, reload };
}

function PageControls({ page, limit, total, onPage }: { page: number; limit: number; total: number; onPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  return <div className="admin-pagination"><span>Showing {total ? (page - 1) * limit + 1 : 0}–{Math.min(page * limit, total)} of {total}</span><div><button disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button><span>Page {page} of {pages}</span><button disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button></div></div>;
}

function AdminDashboard() {
  const { data, loading, error, reload } = useResource<Row>("/admin/dashboard", {});
  const counts = (data.counts ?? {}) as Row;
  const cards = [
    { title: "Total users", field: "total_users", icon: Users, tone: "violet" },
    { title: "New users · 7 days", field: "new_users_7d", icon: Activity, tone: "blue" },
    { title: "Active users · 30 days", field: "active_users_30d", icon: Users, tone: "teal" },
    { title: "Total quizzes", field: "total_quizzes", icon: BookOpen, tone: "amber" },
    { title: "Questions", field: "total_questions", icon: BookOpen, tone: "violet" },
    { title: "Quiz attempts", field: "total_attempts", icon: Check, tone: "blue" },
    { title: "Average score", field: "average_score", icon: Activity, tone: "teal", suffix: "%" },
    { title: "New users · 30 days", field: "new_users_30d", icon: Users, tone: "amber" },
  ];
  const attempts = recordsFrom(data.attemptsPerDay, "attemptsPerDay");
  const maxAttempts = Math.max(1, ...attempts.map((row) => Number(row.attempts ?? row.attempt_count ?? row.count ?? row.total ?? 0)));
  const grading = recordsFrom(data.grading, "grading");
  return <><PageHeading eyebrow="OVERVIEW" title="Admin dashboard" description="A clear view of your platform at a glance." action={<button className="admin-button secondary" onClick={() => void reload()}><RefreshCw size={15} /> Refresh</button>} />
    <LoadPanel loading={loading} error={error} empty={false} retry={() => void reload()}>
      <div className="admin-stat-grid">{cards.map(({ title, field, icon: Icon, tone, suffix }) => <article className="admin-stat-card" key={field}><div className={`admin-stat-icon ${tone}`}><Icon size={18} /></div><span>{title}</span><strong>{valueFor(counts, field)}{counts[field] !== undefined ? suffix ?? "" : ""}</strong><small>Platform overview</small></article>)}</div>
      <div className="admin-dashboard-grid">
        <section className="admin-panel admin-chart-panel"><div className="admin-table-heading"><div><h2>Quiz attempts</h2><p>Daily activity</p></div></div>{attempts.length ? <div className="admin-attempt-chart">{attempts.map((row, i) => { const count = Number(row.attempts ?? row.attempt_count ?? row.count ?? row.total ?? 0); return <div className="admin-attempt-bar" key={String(row.date ?? row.day ?? i)} title={`${count} attempts`}><span style={{ height: `${Math.max(5, count / maxAttempts * 100)}%` }} /><small>{String(row.date ?? row.day ?? "").slice(-5)}</small></div>; })}</div> : <p className="admin-chart-empty">No recent attempts reported.</p>}</section>
        <section className="admin-panel admin-quick-links"><h2>Quick access</h2>{navigation.slice(1).map(({ label, path, icon: Icon }) => <Link key={path} to={path}><span><Icon size={16} />{label}</span><ArrowUpRight size={15} /></Link>)}</section>
      </div>
      <section className="admin-panel admin-grading"><div className="admin-table-heading"><div><h2>Grading</h2><p>Current grading activity and outcomes</p></div></div>{grading.length ? <div className="admin-grading-grid">{grading.map((item, index) => <div key={valueFor(item, "status", "label", "type") + index}><span>{valueFor(item, "status", "label", "type")}</span><strong>{valueFor(item, "count", "total", "average_score", "averageScore")}</strong></div>)}</div> : <p className="admin-chart-empty">{data.grading && typeof data.grading === "object" ? Object.entries(data.grading as Row).map(([k, v]) => `${k.replace(/_/g, " ")}: ${String(v)}`).join(" · ") : "No grading summary available."}</p>}</section>
    </LoadPanel>
  </>;
}

function AdminUsers() {
  const { student, logout, updateStudentInfo } = useAuth();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const query = new URLSearchParams({ page: String(page), limit: "20" });
  if (search.trim()) query.set("search", search.trim());
  if (role) query.set("role", role);
  if (status) query.set("suspended", status);
  const resource = useResource<Row>(`/admin/users?${query.toString()}`, {});
  const [adding, setAdding] = useState(false);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({ fullName: "", email: "", role: "student" });
  const [draftAttempted, setDraftAttempted] = useState(false);
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [resettingUserId, setResettingUserId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Row | null>(null);
  const [details, setDetails] = useState<Row | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState("");
  const [editDraft, setEditDraft] = useState({ fullName: "", email: "" });
  const [editingDetails, setEditingDetails] = useState(false);
  const [editAttempted, setEditAttempted] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [editNotice, setEditNotice] = useState("");
  const [ownCredentialsOpen, setOwnCredentialsOpen] = useState(false);
  const [ownCredentials, setOwnCredentials] = useState({
    fullName: student?.fullName ?? "",
    email: student?.email ?? "",
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [ownCredentialsError, setOwnCredentialsError] = useState("");
  const [ownCredentialsSaving, setOwnCredentialsSaving] = useState(false);
  const draftNameResult = validateName(draft.fullName);
  const draftEmailResult = validateEmail(draft.email);
  const editNameResult = validateName(editDraft.fullName);
  const editEmailResult = validateEmail(editDraft.email);
  const draftNameError = (draftAttempted || draft.fullName.length > 0) ? draftNameResult.error?.message : undefined;
  const draftEmailError = (draftAttempted || draft.email.length > 0) ? draftEmailResult.error?.message : undefined;
  const editNameError = (editAttempted || editDraft.fullName.length > 0) ? editNameResult.error?.message : undefined;
  const editEmailError = (editAttempted || editDraft.email.length > 0) ? editEmailResult.error?.message : undefined;
  const users = recordsFrom(resource.data, "users");
  const total = Number(resource.data.total ?? users.length);
  const limit = Number(resource.data.limit ?? 20);
  const currentPage = Number(resource.data.page ?? page);

  async function createUser(event: FormEvent) {
    event.preventDefault(); setDraftAttempted(true); setFormError(""); setTemporaryPassword("");
    if (draftNameResult.error || draftEmailResult.error) return;
    setSaving(true);
    try {
      const response = await api.post("/admin/users", {
        ...draft,
        fullName: draftNameResult.value,
        email: draftEmailResult.value,
      });
      setTemporaryPassword(String(response.data.temporaryPassword ?? ""));
      setDraft({ fullName: "", email: "", role: "student" }); setDraftAttempted(false); setAdding(false); setPage(1); await resource.reload();
    } catch (err) {
      const requestError = err as { response?: { data?: { message?: string } } };
      setFormError(requestError.response?.data?.message ?? "Could not invite user.");
    } finally { setSaving(false); }
  }

  async function updateUser(user: Row, patch: Row) {
    const id = valueFor(user, "student_id", "id", "userId");
    setFormError("");
    try {
      await api.patch(`/admin/users/${encodeURIComponent(id)}`, patch);
      await resource.reload();
      if (selected && valueFor(selected, "student_id") === id) setSelected({ ...selected, ...patch });
    } catch (err) {
      const requestError = err as { response?: { data?: { message?: string } } };
      setFormError(requestError.response?.data?.message ?? "Could not update this account.");
    }
  }

  async function resetUserPassword(user: Row) {
    const id = valueFor(user, "student_id", "id", "userId");
    const name = valueFor(user, "full_name");
    if (!window.confirm(`Generate a temporary password for ${name}? Their current sessions will be revoked.`)) return;
    setFormError("");
    setTemporaryPassword("");
    setResettingUserId(id);
    try {
      const response = await api.post(`/admin/users/${encodeURIComponent(id)}/reset-password`);
      setTemporaryPassword(String(response.data.temporaryPassword));
      await resource.reload();
    } catch (err) {
      const requestError = err as { response?: { data?: { message?: string } } };
      setFormError(requestError.response?.data?.message ?? "Could not reset this user's password.");
    } finally { setResettingUserId(null); }
  }

  async function loadDetails(user: Row) {
    setSelected(user); setDetails(null); setDetailsError(""); setDetailsLoading(true);
    setEditDraft({ fullName: valueFor(user, "full_name"), email: valueFor(user, "email") });
    setEditingDetails(false); setEditAttempted(false); setEditError(""); setEditNotice("");
    try {
      const id = valueFor(user, "student_id");
      const response = await api.get(`/admin/users/${encodeURIComponent(id)}`);
      setDetails(response.data as Row);
    } catch (err) {
      const requestError = err as { response?: { data?: { message?: string } } };
      setDetailsError(requestError.response?.data?.message ?? "Could not load account activity.");
    } finally { setDetailsLoading(false); }
  }

  async function saveUserDetails(event: FormEvent) {
    event.preventDefault();
    setEditAttempted(true);
    setEditError("");
    if (!selected || editNameResult.error || editEmailResult.error) return;
    setEditSaving(true);
    try {
      const id = valueFor(selected, "student_id", "id", "userId");
      const fullName = normalizeName(editNameResult.value);
      const email = normalizeEmail(editEmailResult.value);
      const currentEmail = normalizeEmail(valueFor(selected, "email"));
      if (fullName === valueFor(selected, "full_name") && email === currentEmail) {
        setEditingDetails(false);
        return;
      }
      const patch: Row = {};
      if (fullName !== valueFor(selected, "full_name")) patch.fullName = fullName;
      if (email !== currentEmail) patch.email = email;
      if (!window.confirm(`Save these account changes for ${valueFor(selected, "full_name")}? A changed email requires verification.`)) {
        setEditSaving(false);
        return;
      }
      const response = await api.patch(`/admin/users/${encodeURIComponent(id)}`, patch);
      setEditNotice(response.data.emailVerificationRequired || patch.email
        ? "Account updated. A verification code was sent to the new email address."
        : "Account details updated.");
      setSelected({ ...selected, full_name: fullName, email });
      setDetails((current) => current ? {
        ...current,
        user: { ...((current.user ?? selected) as Row), full_name: fullName, email },
      } : current);
      setEditDraft({ fullName, email });
      setEditingDetails(false);
      await resource.reload();
    } catch (err) {
      const requestError = err as { response?: { data?: { message?: string; field?: string } } };
      setEditError(requestError.response?.data?.message ?? "Could not update this account.");
    } finally { setEditSaving(false); }
  }

  async function saveOwnCredentials(event: FormEvent) {
    event.preventDefault();
    setOwnCredentialsError("");
    const nameResult = validateName(ownCredentials.fullName);
    const emailResult = validateEmail(ownCredentials.email);
    if (nameResult.error) {
      setOwnCredentialsError(nameResult.error.message);
      return;
    }
    if (emailResult.error) {
      setOwnCredentialsError(emailResult.error.message);
      return;
    }
    const emailChanged = normalizeEmail(emailResult.value) !== normalizeEmail(student?.email ?? "");
    const passwordChanged = Boolean(ownCredentials.newPassword);
    if (passwordChanged && ownCredentials.newPassword !== ownCredentials.confirmPassword) {
      setOwnCredentialsError("Passwords do not match.");
      return;
    }
    if ((emailChanged || passwordChanged) && !ownCredentials.currentPassword) {
      setOwnCredentialsError("Enter your current password to change your email or password.");
      return;
    }
    if (emailChanged || passwordChanged) {
      const changes = [emailChanged && "email", passwordChanged && "password"].filter(Boolean).join(" and ");
      if (!window.confirm(`Confirm your ${changes} change${emailChanged && passwordChanged ? "s" : ""}?`)) return;
    }
    setOwnCredentialsSaving(true);
    try {
      const response = await api.post("/admin/me/credentials", {
        fullName: nameResult.value,
        email: emailResult.value,
        ...(ownCredentials.currentPassword ? { currentPassword: ownCredentials.currentPassword } : {}),
        ...(passwordChanged
          ? { newPassword: ownCredentials.newPassword, confirmPassword: ownCredentials.confirmPassword }
          : {}),
      });
      setOwnCredentialsOpen(false);
      setOwnCredentials({ fullName: nameResult.value, email: emailResult.value, currentPassword: "", newPassword: "", confirmPassword: "" });
      if (response.data.verificationRequired) {
        logout();
        navigate(`/verify-email?email=${encodeURIComponent(emailResult.value)}&delivery=pending`, {
          replace: true,
          state: { message: response.data.message },
        });
      } else if (response.data.reauthenticationRequired) {
        logout();
        navigate("/login", { replace: true, state: { message: response.data.message } });
      } else {
        updateStudentInfo({ fullName: nameResult.value, email: emailResult.value });
      }
    } catch (err) {
      const requestError = err as { response?: { data?: { message?: string } } };
      setOwnCredentialsError(requestError.response?.data?.message ?? "Could not update your admin credentials.");
    } finally { setOwnCredentialsSaving(false); }
  }

  return <><PageHeading eyebrow="PEOPLE" title="Users" description="Invite accounts and manage access across the platform." action={<div className="admin-page-actions"><button className="admin-button secondary" onClick={() => { setOwnCredentialsOpen((value) => !value); setOwnCredentialsError(""); }}><KeyRound size={15} /> My account</button><button className="admin-button primary" onClick={() => setAdding((v) => !v)}><Plus size={16} /> Invite user</button></div>} />
    {ownCredentialsOpen && <form className="admin-panel admin-create-form admin-user-edit-form" onSubmit={(event) => void saveOwnCredentials(event)}>
      <div className="admin-form-heading"><div><h2>My admin account</h2><p>Changing your email or password requires your current password. Email changes require verification.</p></div><button type="button" className="admin-button secondary" onClick={() => setOwnCredentialsOpen(false)}>Cancel</button></div>
      <label>Full name<input required maxLength={100} value={ownCredentials.fullName} onChange={(event) => setOwnCredentials({ ...ownCredentials, fullName: event.target.value })} /></label>
      <label>Email<input type="email" required maxLength={254} value={ownCredentials.email} onChange={(event) => setOwnCredentials({ ...ownCredentials, email: event.target.value })} /></label>
      <label>Current password<input type="password" autoComplete="current-password" value={ownCredentials.currentPassword} onChange={(event) => setOwnCredentials({ ...ownCredentials, currentPassword: event.target.value })} /></label>
      <label>New password <span>(leave blank to keep current)</span><input type="password" autoComplete="new-password" value={ownCredentials.newPassword} onChange={(event) => setOwnCredentials({ ...ownCredentials, newPassword: event.target.value })} /></label>
      {ownCredentials.newPassword && <label>Confirm new password<input type="password" autoComplete="new-password" value={ownCredentials.confirmPassword} onChange={(event) => setOwnCredentials({ ...ownCredentials, confirmPassword: event.target.value })} /></label>}
      {ownCredentialsError && <p className="admin-inline-error" role="alert">{ownCredentialsError}</p>}
      <button className="admin-button primary" type="submit" disabled={ownCredentialsSaving}>{ownCredentialsSaving ? <Spinner label="Saving..." /> : "Save account changes"}</button>
    </form>}
    {temporaryPassword && <div className="admin-temp-password" role="alert"><div><strong>Temporary password — copy it now</strong><p>This is shown only once. The new user must change it when they sign in.</p><code>{temporaryPassword}</code></div><button className="admin-icon-button" onClick={() => setTemporaryPassword("")} aria-label="Dismiss temporary password"><X size={16} /></button></div>}
    {adding && <form className="admin-panel admin-create-form" onSubmit={(e) => void createUser(e)}>
      <div className="admin-form-heading"><div><h2>Invite a user</h2><p>A temporary password is created and shown once after invitation.</p></div><button type="button" className="admin-button secondary" onClick={() => setAdding(false)}>Cancel</button></div>
      <div className="admin-form-grid">
        <label>Full name<input required maxLength={100} value={draft.fullName} onChange={(e) => setDraft({ ...draft, fullName: e.target.value })} aria-invalid={Boolean(draftNameError)} aria-describedby={draftNameError ? "admin-create-name-error" : undefined} />{draftNameError && <span id="admin-create-name-error" className="admin-inline-error" role="alert">{draftNameError}</span>}</label>
        <label>Email<input type="email" required maxLength={254} value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} aria-invalid={Boolean(draftEmailError)} aria-describedby={draftEmailError ? "admin-create-email-error" : undefined} />{draftEmailError && <span id="admin-create-email-error" className="admin-inline-error" role="alert">{draftEmailError}</span>}</label>
        <label>Role<select value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })}><option value="student">Student</option><option value="admin">Admin</option></select></label>
      </div>
      {formError && <p className="admin-inline-error">{formError}</p>}
      <button disabled={saving} className="admin-button primary" type="submit">{saving ? <Spinner label="Inviting..." /> : <><Plus size={15} /> Send invitation</>}</button>
    </form>}
    {!adding && formError && <p className="admin-inline-error">{formError}<button onClick={() => setFormError("")} aria-label="Dismiss error"> ×</button></p>}
    <div className="admin-filter-bar"><input aria-label="Search users" placeholder="Search name or email" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} /><select aria-label="Filter by role" value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }}><option value="">All roles</option><option value="student">Student</option><option value="admin">Admin</option></select><select aria-label="Filter by account status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">All statuses</option><option value="false">Active</option><option value="true">Suspended</option></select><button className="admin-icon-button" onClick={() => void resource.reload()} aria-label="Refresh users"><RefreshCw size={16} /></button></div>
    <LoadPanel loading={resource.loading} error={resource.error} empty={!users.length} retry={() => void resource.reload()}><section className="admin-panel admin-table-panel"><div className="admin-table-heading"><div><h2>All users</h2><p>{total} account{total === 1 ? "" : "s"}</p></div></div><div className="admin-table-scroll"><table className="admin-table"><thead><tr><th>User</th><th>Email</th><th>Role</th><th>Status</th><th>Last login</th><th>Actions</th></tr></thead><tbody>{users.map((user, index) => {
      const id = valueFor(user, "student_id");
      const name = valueFor(user, "full_name");
      const suspended = user.is_suspended === true;
      const forced = user.force_password_reset === true;
      const isSelf = String(student?.studentId) === id;
      const roleChange = user.role === "admin" ? "student" : "admin";
      return <tr key={id !== "—" ? id : index}><td><button className="admin-user-link" onClick={() => void loadDetails(user)}><span className="admin-user-avatar">{name.charAt(0).toUpperCase()}</span><strong>{name}</strong></button></td><td>{valueFor(user, "email")}{(user.email_verified === false || user.email_verified === 0) && <small className="admin-reset-tag">Email not verified</small>}</td><td><span className={`admin-role-badge ${user.role === "admin" ? "admin" : ""}`}>{valueFor(user, "role")}</span></td><td><span className={`admin-status-badge ${suspended ? "suspended" : ""}`}>{suspended ? "Suspended" : "Active"}</span>{forced && <small className="admin-reset-tag">Must change password</small>}</td><td>{displayDate(user.last_login_at)}</td><td><div className="admin-row-actions"><button disabled={isSelf} onClick={() => { const action = roleChange === "admin" ? "Promote" : "Demote"; if (window.confirm(`${action} ${name} ${roleChange === "admin" ? "to administrator" : "to student"}?`)) void updateUser(user, { role: roleChange }); }}>{roleChange === "admin" ? "Promote" : "Demote"}</button><button disabled={isSelf} onClick={() => { const next = !suspended; if (window.confirm(`${next ? "Suspend" : "Reactivate"} ${name}'s account?`)) void updateUser(user, { suspended: next }); }}>{suspended ? "Reactivate" : "Suspend"}</button><button disabled={isSelf || resettingUserId === id} onClick={() => void resetUserPassword(user)}>{resettingUserId === id ? "Resetting..." : "Reset password"}</button><button className="danger" disabled={isSelf} onClick={() => { if (window.confirm(`Delete ${name}'s account?`)) void updateUser(user, { deleted: true }); }}><Trash2 size={14} /> Delete</button></div></td></tr>;
    })}</tbody></table></div><PageControls page={currentPage} limit={limit} total={total} onPage={setPage} /></section></LoadPanel>
    {selected && <div className="admin-drawer-backdrop" onClick={() => setSelected(null)}><aside className="admin-user-drawer" onClick={(event) => event.stopPropagation()}><div className="admin-drawer-header"><div><p className="admin-eyebrow">USER PROFILE</p><h2>{valueFor(selected, "full_name")}</h2></div><button className="admin-icon-button" onClick={() => setSelected(null)} aria-label="Close profile"><X size={17} /></button></div>{detailsLoading ? <Spinner label="Loading profile..." /> : detailsError ? <p className="admin-inline-error">{detailsError}</p> : details && <><button className="admin-button secondary" type="button" onClick={() => { setEditingDetails((value) => !value); setEditError(""); setEditNotice(""); setEditAttempted(false); }}>Edit name and email</button>{editNotice && <p className="admin-success-notice" role="status">{editNotice}</p>}{editingDetails && <form className="admin-create-form admin-user-edit-form" onSubmit={(event) => void saveUserDetails(event)}>
      <label>Full name<input required maxLength={100} value={editDraft.fullName} onChange={(event) => setEditDraft({ ...editDraft, fullName: event.target.value })} aria-invalid={Boolean(editNameError)} aria-describedby={editNameError ? "admin-edit-name-error" : undefined} />{editNameError && <span id="admin-edit-name-error" className="admin-inline-error" role="alert">{editNameError}</span>}</label>
      <label>Email<input type="email" required maxLength={254} value={editDraft.email} onChange={(event) => setEditDraft({ ...editDraft, email: event.target.value })} aria-invalid={Boolean(editEmailError)} aria-describedby={editEmailError ? "admin-edit-email-error" : undefined} />{editEmailError && <span id="admin-edit-email-error" className="admin-inline-error" role="alert">{editEmailError}</span>}</label>
      {editError && <p className="admin-inline-error" role="alert">{editError}</p>}
      <button className="admin-button primary" type="submit" disabled={editSaving}>{editSaving ? <Spinner label="Saving..." /> : "Save changes"}</button>
    </form>}<div className="admin-profile-facts"><span>Email<strong>{valueFor((details.user ?? selected) as Row, "email")}</strong></span><span>Role<strong>{valueFor((details.user ?? selected) as Row, "role")}</strong></span><span>Joined<strong>{displayDate((details.user as Row | undefined)?.created_at ?? selected.created_at)}</strong></span><span>Last login<strong>{displayDate((details.user as Row | undefined)?.last_login_at ?? selected.last_login_at)}</strong></span></div><section><h3>Quiz attempts</h3>{recordsFrom(details.attempts).length ? recordsFrom(details.attempts).map((attempt, i) => <div className="admin-detail-row" key={valueFor(attempt, "attempt_id", "id") + i}><strong>{valueFor(attempt, "quiz_title", "title")}</strong><span>Score: {valueFor(attempt, "score", "percentage")} · {displayDate(attempt.created_at ?? attempt.completed_at)}</span></div>) : <p className="admin-chart-empty">No attempts found.</p>}</section><section><h3>Recent activity</h3>{recordsFrom(details.activity).length ? recordsFrom(details.activity).map((event, i) => <div className="admin-detail-row" key={valueFor(event, "id", "action") + i}><strong>{valueFor(event, "action", "event", "type")}</strong><span>{displayDate(event.created_at ?? event.timestamp)}</span></div>) : <p className="admin-chart-empty">No activity found.</p>}</section></>}</aside></div>}
  </>;
}

interface RiskStudentRow {
  studentId: number;
  fullName: string;
  email: string;
  score: number;
  level: "low" | "medium" | "high";
  topReason: string;
  reasons: string[];
  suggestions: string[];
  subjectBreakdown: Array<{
    subjectId?: number;
    subject: string;
    averageScore: number;
    recordCount: number;
    reasons: string[];
  }>;
}

interface RiskSubjectsResponse {
  students: RiskStudentRow[];
  page: number;
  limit: number;
  total: number;
  subjects: Array<{ subjectId: number; subjectName: string }>;
}

function AdminRiskStudents() {
  const [page, setPage] = useState(1);
  const [level, setLevel] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [expandedStudent, setExpandedStudent] = useState<number | null>(null);
  const query = new URLSearchParams({ page: String(page), limit: "25" });
  if (level) query.set("level", level);
  if (subjectId) query.set("subjectId", subjectId);
  const resource = useResource<RiskSubjectsResponse>(`/admin/analytics/at-risk?${query}`, {
    students: [],
    page,
    limit: 25,
    total: 0,
    subjects: [],
  });
  const students = resource.data.students ?? [];

  return <>
    <PageHeading
      eyebrow="RISK ANALYSIS"
      title="At-Risk Students"
      description="Review explainable academic risk indicators and subject-level trends."
      action={<button className="admin-button secondary" onClick={() => void resource.reload()}><RefreshCw size={15} /> Refresh</button>}
    />
    <div className="admin-filter-bar risk-filter-bar">
      <label>Risk level
        <select aria-label="Filter by risk level" value={level} onChange={(event) => { setLevel(event.target.value); setPage(1); }}>
          <option value="">Medium and High</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </label>
      <label>Subject
        <select aria-label="Filter by subject" value={subjectId} onChange={(event) => { setSubjectId(event.target.value); setPage(1); }}>
          <option value="">All subjects</option>
          {resource.data.subjects?.map((subject) => <option key={subject.subjectId} value={subject.subjectId}>{subject.subjectName}</option>)}
        </select>
      </label>
    </div>
    <LoadPanel loading={resource.loading} error={resource.error} empty={!students.length} retry={() => void resource.reload()}>
      <section className="admin-panel admin-table-panel">
        <div className="admin-table-heading"><div><h2>Risk analysis results</h2><p>{resource.data.total} student{resource.data.total === 1 ? "" : "s"} · sorted by risk score</p></div></div>
        <div className="admin-table-scroll">
          <table className="admin-table risk-table">
            <thead><tr><th>Student</th><th>Email</th><th>Risk level</th><th>Score</th><th>Top reason</th><th>Details</th></tr></thead>
            <tbody>{students.map((student) => <RiskStudentTableRows
              key={student.studentId}
              student={student}
              expanded={expandedStudent === student.studentId}
              onToggle={() => setExpandedStudent((current) => current === student.studentId ? null : student.studentId)}
            />)}</tbody>
          </table>
        </div>
        <PageControls page={resource.data.page ?? page} limit={resource.data.limit ?? 25} total={resource.data.total ?? 0} onPage={setPage} />
      </section>
    </LoadPanel>
  </>;
}

function RiskStudentTableRows({ student, expanded, onToggle }: {
  student: RiskStudentRow;
  expanded: boolean;
  onToggle: () => void;
}) {
  return <>
    <tr>
      <td><strong>{student.fullName}</strong></td>
      <td>{student.email}</td>
      <td><span className={`risk-level-badge risk-level-${student.level}`}>{student.level}</span></td>
      <td><strong>{student.score} / 100</strong></td>
      <td className="risk-top-reason">{student.topReason}</td>
      <td><button className="admin-button secondary risk-details-button" aria-expanded={expanded} onClick={onToggle}>{expanded ? "Hide details" : "View details"}</button></td>
    </tr>
    {expanded && <tr className="risk-expanded-row"><td colSpan={6}>
      <div className="risk-detail-grid">
        <section><h3>Reasons</h3><ul>{student.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></section>
        <section><h3>Suggested actions</h3><ul>{student.suggestions.map((suggestion) => <li key={suggestion}>{suggestion}</li>)}</ul></section>
        <section><h3>Subject breakdown</h3>{student.subjectBreakdown.map((subject) => <p key={`${subject.subjectId}-${subject.subject}`}><strong>{subject.subject}: {Math.round(subject.averageScore)}%</strong> · {subject.recordCount} records</p>)}</section>
      </div>
    </td></tr>}
  </>;
}

function AdminActivity() {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ userId: "", action: "", from: "", to: "" });
  const query = new URLSearchParams({ page: String(page), limit: "25" });
  Object.entries(filters).forEach(([key, value]) => { if (value) query.set(key, value); });
  const resource = useResource<Row>(`/admin/audit?${query.toString()}`, {});
  const logs = recordsFrom(resource.data, "logs");
  const total = Number(resource.data.total ?? logs.length);
  const limit = Number(resource.data.limit ?? 25);
  const currentPage = Number(resource.data.page ?? page);
  function exportCsv() {
    const exportQuery = new URLSearchParams(query);
    exportQuery.set("format", "csv");
    void api.get(`/admin/audit?${exportQuery.toString()}`, { responseType: "blob" }).then((response) => {
      const url = URL.createObjectURL(response.data as Blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "acadance-audit.csv";
      anchor.click();
      URL.revokeObjectURL(url);
    }).catch(() => window.alert("Could not export audit logs. Please try again."));
  }
  return <><PageHeading eyebrow="AUDIT TRAIL" title="Activity logs" description="Filter and export a chronological record of platform activity." action={<button className="admin-button secondary" onClick={exportCsv}><ArrowDownToLine size={15} /> Export CSV</button>} />
    <div className="admin-filter-bar audit"><input placeholder="User ID" aria-label="Filter by user ID" value={filters.userId} onChange={(e) => { setFilters({ ...filters, userId: e.target.value }); setPage(1); }} /><input placeholder="Action" aria-label="Filter by action" value={filters.action} onChange={(e) => { setFilters({ ...filters, action: e.target.value }); setPage(1); }} /><label>From<input type="date" value={filters.from} onChange={(e) => { setFilters({ ...filters, from: e.target.value }); setPage(1); }} /></label><label>To<input type="date" value={filters.to} onChange={(e) => { setFilters({ ...filters, to: e.target.value }); setPage(1); }} /></label><button className="admin-icon-button" onClick={() => void resource.reload()} aria-label="Apply audit filters"><RefreshCw size={16} /></button></div>
    <LoadPanel loading={resource.loading} error={resource.error} empty={!logs.length} retry={() => void resource.reload()}><section className="admin-panel admin-table-panel"><div className="admin-table-scroll"><table className="admin-table"><thead><tr><th>Action</th><th>Actor</th><th>Target</th><th>Time</th><th>Details</th></tr></thead><tbody>{logs.map((event, i) => <tr key={valueFor(event, "id", "log_id") !== "—" ? valueFor(event, "id", "log_id") : i}><td><span className="admin-event-name">{valueFor(event, "action")}</span></td><td>{valueFor(event, "actor_name", "actor", "user_email", "user_id")}</td><td>{valueFor(event, "target", "resource", "target_id")}</td><td>{displayDate(event.created_at)}</td><td>{valueFor(event, "details", "description", "message")}</td></tr>)}</tbody></table></div><PageControls page={currentPage} limit={limit} total={total} onPage={setPage} /></section></LoadPanel>
  </>;
}

function AdminContent() {
  const resource = useResource<Row>("/admin/content", {});
  const [message, setMessage] = useState("");
  const quizzes = recordsFrom(resource.data, "quizzes");
  const questions = recordsFrom(resource.data.questions, "questions");
  const flags = recordsFrom(resource.data, "flags");
  async function mutate(url: string, method: "patch" | "delete", payload?: Row) {
    try { if (method === "patch") await api.patch(url, payload); else await api.delete(url); setMessage("Content updated."); await resource.reload(); }
    catch (err) { const requestError = err as { response?: { data?: { message?: string } } }; setMessage(requestError.response?.data?.message ?? "Could not update content."); }
  }
  return <><PageHeading eyebrow="LIBRARY" title="Content" description="Review quizzes, edit questions, and resolve reported content." action={<button className="admin-button secondary" onClick={() => void resource.reload()}><RefreshCw size={15} /> Refresh</button>} />
    {message && <div className="admin-toast" role="status">{message}<button onClick={() => setMessage("")} aria-label="Dismiss message">×</button></div>}
    <LoadPanel loading={resource.loading} error={resource.error} empty={!quizzes.length && !questions.length && !flags.length} retry={() => void resource.reload()}>
      <section className="admin-content-section"><div className="admin-section-heading"><div><h2>Quizzes</h2><p>{quizzes.length} quizzes</p></div></div><div className="admin-panel admin-table-panel"><div className="admin-table-scroll"><table className="admin-table"><thead><tr><th>Title</th><th>Subject</th><th>Difficulty</th><th>Questions</th><th>Visibility</th><th>Manage</th></tr></thead><tbody>{quizzes.map((quiz, i) => { const id = valueFor(quiz, "quiz_id"); const hidden = quiz.is_hidden === true; return <tr key={id !== "—" ? id : i}><td><strong>{valueFor(quiz, "title")}</strong><small className="admin-subline">{displayDate(quiz.created_at)}</small></td><td>{valueFor(quiz, "subject_name")}</td><td>{valueFor(quiz, "difficulty")}</td><td>{valueFor(quiz, "question_count")}</td><td>{hidden ? "Hidden" : "Visible"}</td><td><div className="admin-row-actions"><button onClick={() => { const title = window.prompt("Quiz title", valueFor(quiz, "title")); if (title?.trim()) void mutate(`/admin/content/quizzes/${encodeURIComponent(id)}`, "patch", { title: title.trim() }); }}>Rename</button><button onClick={() => void mutate(`/admin/content/quizzes/${encodeURIComponent(id)}`, "patch", { is_hidden: !hidden })}>{hidden ? "Show" : "Hide"}</button><button className="danger" onClick={() => { if (window.confirm("Delete this quiz?")) void mutate(`/admin/content/quizzes/${encodeURIComponent(id)}`, "delete"); }}><Trash2 size={14} /> Delete</button></div></td></tr>; })}</tbody></table></div></div></section>
      <section className="admin-content-section"><div className="admin-section-heading"><div><h2>Questions</h2><p>{questions.length} questions</p></div></div><div className="admin-panel admin-table-panel"><div className="admin-table-scroll"><table className="admin-table"><thead><tr><th>Question</th><th>Quiz</th><th>Type</th><th>Visibility</th><th>Manage</th></tr></thead><tbody>{questions.map((question, i) => { const id = valueFor(question, "question_id"); const hidden = question.is_hidden === true; return <tr key={id !== "—" ? id : i}><td className="admin-question-text">{valueFor(question, "question_text")}</td><td>{quizzes.find((quiz) => valueFor(quiz, "quiz_id") === valueFor(question, "quiz_id")) ? valueFor(quizzes.find((quiz) => valueFor(quiz, "quiz_id") === valueFor(question, "quiz_id"))!, "title") : valueFor(question, "quiz_id")}</td><td>{valueFor(question, "question_type")}</td><td>{hidden ? "Hidden" : "Visible"}</td><td><div className="admin-row-actions"><button onClick={() => { const text = window.prompt("Edit question", valueFor(question, "question_text")); if (text?.trim()) void mutate(`/admin/content/questions/${encodeURIComponent(id)}`, "patch", { question_text: text.trim() }); }}>Edit</button><button onClick={() => void mutate(`/admin/content/questions/${encodeURIComponent(id)}`, "patch", { is_hidden: !hidden })}>{hidden ? "Show" : "Hide"}</button><button className="danger" onClick={() => { if (window.confirm("Delete this question?")) void mutate(`/admin/content/questions/${encodeURIComponent(id)}`, "delete"); }}><Trash2 size={14} /> Delete</button></div></td></tr>; })}</tbody></table></div></div></section>
      <section className="admin-content-section"><div className="admin-section-heading"><div><h2>Reported content</h2><p>{flags.length} flags</p></div></div>{flags.length ? <div className="admin-panel admin-job-list">{flags.map((flag, i) => { const id = valueFor(flag, "flag_id"); return <div className="admin-job-row" key={id !== "—" ? id : i}><div className="admin-job-icon"><AlertTriangle size={17} /></div><div className="admin-job-detail"><strong>{valueFor(flag, "reason")}</strong><span>Quiz {valueFor(flag, "quiz_id")} · Question {valueFor(flag, "question_id")} · {displayDate(flag.created_at)}</span></div><button className="admin-button secondary" onClick={() => void mutate(`/admin/content/flags/${encodeURIComponent(id)}/resolve`, "patch", { resolved: true })}><Check size={14} /> Resolve</button></div>; })}</div> : <div className="admin-panel admin-state"><strong>No open flags</strong><p>Reported items will appear here.</p></div>}</section>
    </LoadPanel>
  </>;
}

function AdminAI() {
  const resource = useResource<Row>("/admin/ai/monitoring", {});
  const stats = recordsFrom(resource.data.providerStats, "providerStats");
  const pending = recordsFrom(resource.data.pending, "pending");
  const [retrying, setRetrying] = useState("");
  const [message, setMessage] = useState("");
  async function retry(answerId: string) {
    setRetrying(answerId); setMessage("");
    try { await api.post(`/admin/ai/pending/${encodeURIComponent(answerId)}/retry`); setMessage("Retry queued successfully."); await resource.reload(); }
    catch { setMessage("Could not retry this answer."); }
    finally { setRetrying(""); }
  }
  return <><PageHeading eyebrow="INTELLIGENCE" title="AI monitoring" description="Review provider health and retry pending answers." action={<button className="admin-button secondary" onClick={() => void resource.reload()}><RefreshCw size={15} /> Refresh</button>} />
    <LoadPanel loading={resource.loading} error={resource.error} empty={false} retry={() => void resource.reload()}>
      <div className="admin-section-heading"><div><h2>Provider statistics</h2><p>Request outcomes and rate-limit events</p></div></div>
      {stats.length ? <div className="admin-panel admin-table-panel"><div className="admin-table-scroll"><table className="admin-table"><thead><tr><th>Provider</th><th>Operation</th><th>Requests</th><th>Succeeded</th><th>Failed</th><th>Rate limits</th></tr></thead><tbody>{stats.map((provider, i) => <tr key={`${valueFor(provider, "provider")}-${valueFor(provider, "operation")}-${i}`}><td><strong>{valueFor(provider, "provider")}</strong></td><td>{valueFor(provider, "operation")}</td><td>{valueFor(provider, "requests")}</td><td>{valueFor(provider, "succeeded")}</td><td>{valueFor(provider, "failed")}</td><td>{valueFor(provider, "rate_limit_hits")}</td></tr>)}</tbody></table></div></div> : <div className="admin-panel admin-state"><strong>No provider metrics</strong></div>}
      <div className="admin-section-heading"><div><h2>Pending answers</h2><p>Retry queued AI answer grading tasks.</p></div></div>
      {message && <div className="admin-toast" role="status">{message}<button onClick={() => setMessage("")} aria-label="Dismiss message">×</button></div>}
      {pending.length ? <section className="admin-panel admin-job-list">{pending.map((answer, i) => { const id = valueFor(answer, "answer_id"); return <div className="admin-job-row" key={id !== "—" ? id : i}><div className="admin-job-icon"><Bot size={17} /></div><div className="admin-job-detail"><strong>{valueFor(answer, "quiz_title")}</strong><span>{valueFor(answer, "full_name")} · {valueFor(answer, "question_text")}</span></div><button className="admin-button secondary" disabled={retrying === id} onClick={() => void retry(id)}>{retrying === id ? <Spinner label="Retrying..." /> : <><RefreshCw size={14} /> Retry</>}</button></div>; })}</section> : <div className="admin-panel admin-state"><strong>No pending answers</strong><p>Queued answers will appear here.</p></div>}
    </LoadPanel>
  </>;
}

function AdminSystem() {
  const resource = useResource<Row>("/admin/system", {});
  const providers = resource.data.providers && typeof resource.data.providers === "object" ? resource.data.providers as Row : {};
  const providerNames = ["groq", "gemini", "ollama", "local-engine"];
  return <><PageHeading eyebrow="OPERATIONS" title="System" description="Inspect database health, AI providers, uptime, and recent errors." action={<button className="admin-button secondary" onClick={() => void resource.reload()}><RefreshCw size={15} /> Refresh</button>} />
    <LoadPanel loading={resource.loading} error={resource.error} empty={false} retry={() => void resource.reload()}><div className="admin-system-grid"><article className="admin-panel admin-system-card"><div className="admin-system-label"><Server size={16} /> Database</div><strong>{typeof resource.data.database === "object" ? JSON.stringify(resource.data.database) : String(resource.data.database ?? "—")}</strong></article><article className="admin-panel admin-system-card"><div className="admin-system-label"><Activity size={16} /> Uptime</div><strong>{Math.floor(Number(resource.data.uptimeSeconds ?? 0) / 3600)}h {Math.floor(Number(resource.data.uptimeSeconds ?? 0) % 3600 / 60)}m</strong></article>{providerNames.map((name) => <article className="admin-panel admin-system-card" key={name}><div className="admin-system-label"><span className="admin-system-icon"><Bot size={16} /></span>{name}</div><strong>{typeof providers[name] === "object" ? JSON.stringify(providers[name]) : String(providers[name] ?? "—")}</strong></article>)}</div><section className="admin-content-section"><div className="admin-section-heading"><div><h2>Recent errors</h2><p>Latest reported platform errors</p></div></div>{recordsFrom(resource.data.recentErrors, "recentErrors").length ? <div className="admin-panel admin-job-list">{recordsFrom(resource.data.recentErrors, "recentErrors").map((error, i) => <div className="admin-job-row" key={valueFor(error, "id") + i}><div className="admin-job-icon"><AlertTriangle size={17} /></div><div className="admin-job-detail"><strong>{valueFor(error, "message", "error", "type")}</strong><span>{displayDate(error.created_at ?? error.timestamp)} · {valueFor(error, "source", "service")}</span></div></div>)}</div> : <div className="admin-panel admin-state"><strong>No recent errors</strong></div>}</section></LoadPanel>
  </>;
}

function AdminBackups() {
  const resource = useResource<Row>("/admin/backups", {});
  const backups = recordsFrom(resource.data.backups, "backups");
  const lastSuccessfulBackup = resource.data.lastSuccessfulBackup
    ? String(resource.data.lastSuccessfulBackup)
    : null;
  const stale = !lastSuccessfulBackup ||
    Date.now() - new Date(lastSuccessfulBackup).getTime() > 48 * 60 * 60 * 1000;
  const copyConfigured = resource.data.offMachineCopyConfigured === true;
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function createBackup() {
    setCreating(true);
    setMessage("");
    setError("");
    try {
      const response = await api.post("/admin/backups");
      const copyError = response.data.copyError as string | null;
      const retentionError = response.data.retentionError as string | null;
      const warnings = [copyError, retentionError].filter(Boolean).join(" ");
      setMessage(warnings
        ? `Backup saved locally. ${warnings}`
        : `Backup ${String(response.data.backup?.name ?? "")} completed successfully.`);
      await resource.reload();
    } catch (requestError) {
      const err = requestError as { response?: { data?: { message?: string } } };
      setError(err.response?.data?.message ?? "Could not create a database backup.");
    } finally {
      setCreating(false);
    }
  }

  async function downloadBackup(name: string) {
    setError("");
    try {
      const response = await api.get(
        `/admin/backups/${encodeURIComponent(name)}/download`,
        { responseType: "blob" }
      );
      const url = URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError("Could not download this backup.");
    }
  }

  return <>
    <PageHeading
      eyebrow="OPERATIONS"
      title="Backups"
      description="Create and verify protected database backups."
      action={<button className="admin-button primary" disabled={creating} onClick={() => void createBackup()}>
        {creating ? <Spinner label="Creating backup..." /> : <><Database size={15} /> Backup now</>}
      </button>}
    />
    {creating && <div className="admin-panel admin-state"><Spinner label="Creating and verifying database backup..." /></div>}
    {message && <div className="admin-toast" role="status">{message}</div>}
    {error && <div className="admin-panel admin-report-error" role="alert">{error}</div>}
    {stale && <div className="admin-panel admin-report-error" role="status">
      <AlertTriangle size={17} /> {lastSuccessfulBackup
        ? "The latest successful backup is older than 48 hours."
        : "No successful database backup is available yet."}
    </div>}
    {!copyConfigured && <div className="admin-panel admin-report-error" role="status">
      <AlertTriangle size={17} /> No off-machine backup copy is configured. Set BACKUP_COPY_DIR to a separate drive or synced folder.
    </div>}
    <section className="admin-content-section">
      <div className="admin-section-heading"><div><h2>Backup history</h2>
        <p>Last successful backup: {lastSuccessfulBackup ? displayDate(lastSuccessfulBackup) : "Never"}</p>
      </div><button className="admin-button secondary" onClick={() => void resource.reload()}>
        <RefreshCw size={15} /> Refresh
      </button></div>
      <LoadPanel loading={resource.loading} error={resource.error} empty={!backups.length} retry={() => void resource.reload()}>
        <div className="admin-panel admin-table-panel"><div className="admin-table-scroll">
          <table className="admin-table"><thead><tr>
            <th>Backup</th><th>Date</th><th>Size</th><th>Checksum</th><th>Off-machine copy</th><th>Download</th>
          </tr></thead><tbody>{backups.map((backup, index) => {
            const name = valueFor(backup, "name");
            const size = Number(backup.size);
            return <tr key={name || index}>
              <td><strong>{name}</strong></td>
              <td>{displayDate(backup.date)}</td>
              <td>{Number.isFinite(size) ? `${(size / (1024 * 1024)).toFixed(2)} MB` : "—"}</td>
              <td>{valueFor(backup, "checksumStatus")}</td>
              <td>{backup.copied === true ? "Copied" : "Not copied"}</td>
              <td><button className="admin-button secondary" onClick={() => void downloadBackup(name)}>
                <ArrowDownToLine size={14} /> Download
              </button></td>
            </tr>;
          })}</tbody></table>
        </div></div>
      </LoadPanel>
    </section>
  </>;
}

function AdminAnnouncements() {
  const resource = useResource<unknown>("/admin/announcements", []);
  const announcements = recordsFrom(resource.data, "announcements");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  async function publish(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError("");
    try { await api.post("/admin/announcements", { message }); setMessage(""); window.dispatchEvent(new Event("acadance:announcements-updated")); await resource.reload(); }
    catch (err) { const requestError = err as { response?: { data?: { message?: string } } }; setError(requestError.response?.data?.message ?? "Could not publish the announcement."); }
    finally { setSaving(false); }
  }
  return <><PageHeading eyebrow="COMMUNICATION" title="Announcements" description="Share timely updates with your Acadance community." />
    <form className="admin-panel admin-announcement-form" onSubmit={(e) => void publish(e)}><div className="admin-form-heading"><div><h2>New announcement</h2><p>Published announcements are visible to your users.</p></div><span className="admin-form-icon"><Megaphone size={18} /></span></div><label>Message<textarea required rows={4} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Write your update..." /></label>{error && <p className="admin-inline-error">{error}</p>}<button type="submit" className="admin-button primary" disabled={saving}>{saving ? <Spinner label="Publishing..." /> : <><Megaphone size={15} /> Publish announcement</>}</button></form>
    <div className="admin-section-heading"><div><h2>Published</h2><p>Recent platform announcements.</p></div><button className="admin-icon-button" onClick={() => void resource.reload()} aria-label="Refresh announcements"><RefreshCw size={16} /></button></div>
    <LoadPanel loading={resource.loading} error={resource.error} empty={!announcements.length} retry={() => void resource.reload()}><div className="admin-announcement-list">{announcements.map((item, i) => <article className="admin-panel admin-announcement-card" key={valueFor(item, "id", "announcement_id") !== "—" ? valueFor(item, "id", "announcement_id") : i}><div className="admin-announcement-top"><span className="admin-published"><i /> Published</span><time>{displayDate(item.created_at)}</time></div><p>{valueFor(item, "message")}</p></article>)}</div></LoadPanel>
  </>;
}

export default function AdminPortal() {
  return <AdminFrame><Routes>
    <Route index element={<AdminDashboard />} />
    <Route path="analytics" element={<AdminRiskStudents />} />
    <Route path="reports" element={<AdminReports />} />
    <Route path="users" element={<AdminUsers />} />
    <Route path="activity" element={<AdminActivity />} />
    <Route path="content" element={<AdminContent />} />
    <Route path="ai" element={<AdminAI />} />
    <Route path="backups" element={<AdminBackups />} />
    <Route path="system" element={<AdminSystem />} />
    <Route path="announcements" element={<AdminAnnouncements />} />
    <Route path="*" element={<Navigate to="/admin" replace />} />
  </Routes></AdminFrame>;
}
