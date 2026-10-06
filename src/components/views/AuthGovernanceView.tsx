import React, { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, Users, Activity, Plus, Search, Loader2, Lock, Unlock, LogOut, Trash2, Pencil, X, KeyRound } from 'lucide-react';
import { useAuth, type RoleCode } from '../../context/AuthContext';
import { ROLES } from '../../lib/authData';
import { api } from '../../lib/api';
import { evaluatePasswordPolicy } from '../../lib/passwordUtils';

interface AdminUser {
  id: string;
  email: string;
  name: string;
  roleCode: RoleCode;
  roleName: string;
  department: string;
  status: 'ACTIVE' | 'LOCKED';
  isDemoUser: boolean;
  hasPassword: boolean;
  googleLinked: boolean;
  lastLoginAt: string | null;
  profile?: Record<string, unknown>;
}

interface SessionSummary {
  userId: string;
  name: string;
  email: string;
  roleCode: RoleCode;
  activeSessions: number;
  lastSignIn: string;
  expiresAt: string;
}

const SAMPLE_EMAILS = /@(demo\.thapar\.local)$|^(kn\.murthy|a\.sharma|p\.gupta|s\.roy|aarav\.m|rahul\.v|dean)@thapar\.edu$/;
const card = 'bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl shadow-xs';
const input = 'w-full bg-white dark:bg-zinc-950 border border-[#E5E2D9] dark:border-zinc-800 rounded-lg p-2 text-xs text-stone-900 dark:text-zinc-100 outline-none focus:border-[#8C1B2E]';
const roleBadge = (code: RoleCode) =>
  code === 'COORDINATOR'
    ? 'bg-red-50 text-[#8C1B2E] border border-red-200 dark:bg-red-950/40 dark:text-red-300'
    : code === 'HOD'
      ? 'bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300'
      : code === 'FACULTY'
        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300'
        : code === 'COLLEGE_ADMIN' || code === 'SUPER_ADMIN'
          ? 'bg-purple-50 text-purple-800 border border-purple-200 dark:bg-purple-950/40 dark:text-purple-300'
          : 'bg-stone-100 text-stone-700 dark:bg-zinc-800 dark:text-zinc-400';
const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString() : '—');

export function AuthGovernanceView() {
  const { currentUser, currentInstitution } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [form, setForm] = useState({ email: '', name: '', roleCode: 'FACULTY' as RoleCode, department: '', password: '' });
  const limit = 25;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [u, s] = await Promise.all([
        api<{ users: AdminUser[]; total: number }>(`/api/admin/users?search=${encodeURIComponent(search)}&page=${page}&limit=${limit}`),
        api<{ sessions: SessionSummary[] }>('/api/admin/sessions'),
      ]);
      setUsers(u.users);
      setTotal(u.total);
      setSessions(s.sessions);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load users.');
    } finally {
      setLoading(false);
    }
  }, [search, page]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const act = async (key: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(key);
    setError(null);
    setInfo(null);
    try {
      await fn();
      setInfo(done);
      await load();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed.');
      return false;
    } finally {
      setBusy(null);
    }
  };

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password && !evaluatePasswordPolicy(form.password).isValid) {
      setError(`Password needs: ${evaluatePasswordPolicy(form.password).errors.join(', ')}.`);
      return;
    }
    const ok = await act('create', () => api('/api/admin/users', { body: { ...form, password: form.password || undefined } }), `Added ${form.email}.`);
    if (ok) setForm({ email: '', name: '', roleCode: 'FACULTY', department: '', password: '' });
  };

  const saveEdit = async (changes: Partial<AdminUser> & { password?: string }) => {
    if (!editing) return;
    const ok = await act('edit', () => api(`/api/admin/users/${editing.id}`, { method: 'PATCH', body: changes }), `Saved ${editing.email}.`);
    if (ok) setEditing(null);
  };

  const pages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="border-b border-[#E5E2D9] dark:border-zinc-800 pb-4">
        <div className="flex items-center gap-2 text-[#8C1B2E] dark:text-red-400 text-xs font-semibold uppercase tracking-wider mb-1">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          <span>Identity & Access</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-serif font-bold text-stone-900 dark:text-zinc-100 tracking-tight">Users & Roles</h1>
        <p className="text-xs sm:text-sm text-stone-600 dark:text-zinc-400 mt-1 max-w-3xl leading-relaxed">
          Students and faculty in the imported roster get access automatically the first time they sign in with Google. Coordinator, HOD and admin roles are assigned here. Role, lock and password changes sign the user out everywhere immediately.
        </p>
      </div>

      {(error || info) && (
        <div role={error ? 'alert' : 'status'} className={`p-3 rounded-xl text-xs border ${error ? 'bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/40 dark:border-rose-900 dark:text-rose-300' : 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-900 dark:text-emerald-300'}`}>
          {error ?? info}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className={`${card} overflow-hidden`}>
            <div className="p-4 border-b border-[#E5E2D9] dark:border-zinc-800 flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-zinc-950/50">
              <div>
                <h2 className="text-sm font-serif font-bold text-stone-900 dark:text-zinc-100 flex items-center gap-2">
                  <Users className="h-4 w-4 text-[#8C1B2E] dark:text-red-400" aria-hidden="true" />
                  <span>Accounts</span>
                </h2>
                <p className="text-[11px] text-stone-500 dark:text-zinc-400 mt-0.5">{currentInstitution.name} · {total} accounts</p>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="h-3.5 w-3.5 text-stone-400 absolute left-2.5 top-2.5" aria-hidden="true" />
                <label htmlFor="user-search" className="sr-only">Search users</label>
                <input id="user-search" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search name or email" className={`${input} pl-8`} />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[#E5E2D9] dark:border-zinc-800 bg-[#F4F2EC] dark:bg-zinc-950/80 text-stone-600 dark:text-zinc-400 font-mono">
                    <th className="p-3 font-semibold">User</th>
                    <th className="p-3 font-semibold">Role</th>
                    <th className="p-3 font-semibold">Sign-in</th>
                    <th className="p-3 font-semibold">Status</th>
                    <th className="p-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E2D9] dark:divide-zinc-800">
                  {loading && !users.length ? (
                    <tr><td colSpan={5} className="p-6 text-center text-stone-500"><Loader2 className="h-4 w-4 animate-spin inline" /> Loading…</td></tr>
                  ) : users.length === 0 ? (
                    <tr><td colSpan={5} className="p-6 text-center text-stone-500">No users match.</td></tr>
                  ) : (
                    users.map((u) => {
                      const self = u.id === currentUser?.id;
                      return (
                        <tr key={u.id} className="bg-white dark:bg-zinc-900 hover:bg-stone-50 dark:hover:bg-zinc-800/40">
                          <td className="p-3">
                            <div className="font-bold text-stone-900 dark:text-zinc-100 flex items-center gap-1.5">
                              {u.name}
                              {(u.isDemoUser || SAMPLE_EMAILS.test(u.email)) && (
                                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300">{u.isDemoUser ? 'Demo' : 'Sample'}</span>
                              )}
                              {self && <span className="text-[9px] font-mono text-stone-500">(you)</span>}
                            </div>
                            <div className="text-[11px] font-mono text-stone-500 dark:text-zinc-400">{u.email}</div>
                            {u.department && <div className="text-[10px] text-stone-400">{u.department}</div>}
                          </td>
                          <td className="p-3"><span className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${roleBadge(u.roleCode)}`}>{u.roleName}</span></td>
                          <td className="p-3 text-[11px] text-stone-600 dark:text-zinc-400">
                            {[u.googleLinked && 'Google', u.hasPassword && 'Password'].filter(Boolean).join(' + ') || 'Google (not yet linked)'}
                            <div className="text-[10px] text-stone-400">Last: {fmt(u.lastLoginAt)}</div>
                          </td>
                          <td className="p-3">
                            <span className={`text-[10px] font-mono font-semibold ${u.status === 'ACTIVE' ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}>{u.status}</span>
                          </td>
                          <td className="p-3">
                            <div className="flex justify-end gap-1">
                              <IconButton label={`Edit ${u.email}`} onClick={() => setEditing(u)}><Pencil className="h-3.5 w-3.5" /></IconButton>
                              {!self && (
                                <IconButton
                                  label={u.status === 'ACTIVE' ? `Lock ${u.email}` : `Unlock ${u.email}`}
                                  disabled={busy !== null}
                                  onClick={() => act(`lock-${u.id}`, () => api(`/api/admin/users/${u.id}`, { method: 'PATCH', body: { status: u.status === 'ACTIVE' ? 'LOCKED' : 'ACTIVE' } }), u.status === 'ACTIVE' ? `Locked ${u.email}.` : `Unlocked ${u.email}.`)}
                                >
                                  {u.status === 'ACTIVE' ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                                </IconButton>
                              )}
                              <IconButton label={`Sign ${u.email} out everywhere`} disabled={busy !== null} onClick={() => act(`revoke-${u.id}`, () => api(`/api/admin/users/${u.id}/revoke-sessions`, { method: 'POST' }), `Signed ${u.email} out of all devices.`)}>
                                <LogOut className="h-3.5 w-3.5" />
                              </IconButton>
                              {!self && (
                                <IconButton
                                  label={`Delete ${u.email}`}
                                  danger
                                  disabled={busy !== null}
                                  onClick={() => window.confirm(`Delete ${u.email}? This cannot be undone.`) && act(`del-${u.id}`, () => api(`/api/admin/users/${u.id}`, { method: 'DELETE' }), `Deleted ${u.email}.`)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </IconButton>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            {pages > 1 && (
              <div className="flex items-center justify-between p-3 text-[11px] text-stone-500 border-t border-[#E5E2D9] dark:border-zinc-800">
                <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-2 py-1 rounded disabled:opacity-40 hover:bg-stone-100 dark:hover:bg-zinc-800">Previous</button>
                <span>Page {page} of {pages}</span>
                <button disabled={page >= pages} onClick={() => setPage(page + 1)} className="px-2 py-1 rounded disabled:opacity-40 hover:bg-stone-100 dark:hover:bg-zinc-800">Next</button>
              </div>
            )}
          </div>

          <div className={`${card} p-5 space-y-3`}>
            <div className="flex items-center justify-between border-b border-[#E5E2D9] dark:border-zinc-800 pb-3">
              <h2 className="text-sm font-serif font-bold text-stone-900 dark:text-zinc-100 flex items-center gap-2">
                <Activity className="h-4 w-4 text-[#8C1B2E] dark:text-red-400" aria-hidden="true" />
                <span>Signed-in users</span>
              </h2>
              <span className="text-xs font-mono text-emerald-700 dark:text-emerald-400 font-semibold">{sessions.reduce((n, s) => n + s.activeSessions, 0)} active sessions</span>
            </div>
            {sessions.length === 0 ? (
              <p className="text-xs text-stone-500">Nobody is signed in.</p>
            ) : (
              <ul className="space-y-2">
                {sessions.map((s) => (
                  <li key={s.userId} className="p-3 rounded-lg border bg-white dark:bg-zinc-950/60 border-[#E5E2D9] dark:border-zinc-800 text-xs flex items-center justify-between gap-2">
                    <div>
                      <div className="font-bold">{s.name} <span className="text-[10px] font-mono text-stone-500">({s.roleCode})</span></div>
                      <div className="text-[10px] font-mono text-stone-500">{s.activeSessions} device(s) · last sign-in {fmt(s.lastSignIn)} · expires {fmt(s.expiresAt)}</div>
                    </div>
                    <button
                      onClick={() => act(`revoke-${s.userId}`, () => api(`/api/admin/users/${s.userId}/revoke-sessions`, { method: 'POST' }), `Signed ${s.email} out.`)}
                      disabled={busy !== null}
                      className="px-2.5 py-1 text-[11px] text-[#8C1B2E] dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded font-semibold disabled:opacity-50"
                    >
                      Sign out
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <form onSubmit={createUser} className={`${card} p-5 space-y-3`}>
            <h2 className="text-sm font-serif font-bold text-stone-900 dark:text-zinc-100 flex items-center gap-2 border-b border-[#E5E2D9] dark:border-zinc-800 pb-3">
              <KeyRound className="h-4 w-4 text-[#8C1B2E] dark:text-red-400" aria-hidden="true" />
              <span>Add a user</span>
            </h2>
            <Field id="new-email" label="Email">
              <input id="new-email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="name@thapar.edu" className={input} />
            </Field>
            <Field id="new-name" label="Full name">
              <input id="new-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={input} />
            </Field>
            <Field id="new-role" label="Role">
              <select id="new-role" value={form.roleCode} onChange={(e) => setForm({ ...form, roleCode: e.target.value as RoleCode })} className={input}>
                {ROLES.map((r) => <option key={r.id} value={r.code}>{r.name}</option>)}
              </select>
            </Field>
            <Field id="new-dept" label="Department (optional)">
              <input id="new-dept" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} className={input} />
            </Field>
            <Field id="new-password" label="Password (optional)">
              <input id="new-password" type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Leave blank for Google sign-in only" className={input} />
            </Field>
            <button type="submit" disabled={busy !== null} className="w-full py-2 bg-[#8C1B2E] hover:bg-[#731625] disabled:opacity-60 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5">
              {busy === 'create' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              <span>Add user</span>
            </button>
          </form>
        </div>
      </div>

      {editing && <EditUserDialog user={editing} isSelf={editing.id === currentUser?.id} busy={busy === 'edit'} onClose={() => setEditing(null)} onSave={saveEdit} />}
    </div>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-[10px] font-mono text-stone-500 dark:text-zinc-400 block">{label}</label>
      {children}
    </div>
  );
}

function IconButton({ label, onClick, disabled, danger, children }: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`p-1.5 rounded border border-[#E5E2D9] dark:border-zinc-700 disabled:opacity-40 ${danger ? 'text-rose-700 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30' : 'text-stone-700 hover:bg-stone-100 dark:text-zinc-300 dark:hover:bg-zinc-800'}`}
    >
      {children}
    </button>
  );
}

function EditUserDialog({ user, isSelf, busy, onClose, onSave }: { user: AdminUser; isSelf: boolean; busy: boolean; onClose: () => void; onSave: (c: Partial<AdminUser> & { password?: string }) => void }) {
  const [name, setName] = useState(user.name);
  const [department, setDepartment] = useState(user.department);
  const [roleCode, setRoleCode] = useState<RoleCode>(user.roleCode);
  const [password, setPassword] = useState('');
  const [facultyId, setFacultyId] = useState(String(user.profile?.facultyId ?? ''));
  const policy = password ? evaluatePasswordPolicy(password) : null;

  return (
    <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs z-60 flex items-center justify-center p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="edit-user-title" onClick={(e) => e.stopPropagation()} className="bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl max-w-md w-full p-6 space-y-4 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 id="edit-user-title" className="text-base font-serif font-bold">Edit {user.email}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 rounded hover:bg-stone-100 dark:hover:bg-zinc-800"><X className="h-4 w-4" /></button>
        </div>
        <Field id="edit-name" label="Full name"><input id="edit-name" value={name} onChange={(e) => setName(e.target.value)} className={input} /></Field>
        <Field id="edit-dept" label="Department"><input id="edit-dept" value={department} onChange={(e) => setDepartment(e.target.value)} className={input} /></Field>
        <Field id="edit-role" label={isSelf ? 'Role (you cannot change your own role)' : 'Role'}>
          <select id="edit-role" value={roleCode} disabled={isSelf} onChange={(e) => setRoleCode(e.target.value as RoleCode)} className={input}>
            {ROLES.map((r) => <option key={r.id} value={r.code}>{r.name}</option>)}
          </select>
        </Field>
        {['FACULTY', 'HOD', 'COORDINATOR'].includes(roleCode) && (
          <Field id="edit-faculty" label="Linked faculty record id (only if the email differs from the faculty roster)">
            <input id="edit-faculty" value={facultyId} onChange={(e) => setFacultyId(e.target.value.trim())} placeholder="e.g. fac-0001" className={input} />
          </Field>
        )}
        <Field id="edit-password" label="Set a new password (optional)">
          <input id="edit-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={input} />
        </Field>
        {policy && !policy.isValid && <p className="text-[11px] text-rose-700 dark:text-rose-400">Needs: {policy.errors.join(', ')}.</p>}
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-xs font-medium text-stone-600 dark:text-zinc-400">Cancel</button>
          <button
            type="button"
            disabled={busy || (policy !== null && !policy.isValid)}
            onClick={() => onSave({ name, department, profile: { facultyId }, ...(isSelf ? {} : { roleCode }), ...(password ? { password } : {}) })}
            className="px-4 py-2 bg-[#8C1B2E] hover:bg-[#731625] disabled:opacity-60 text-white rounded-lg text-xs font-semibold"
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
