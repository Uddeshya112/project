import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ThaparLogo } from '../ThaparLogo';
import { Mail, Lock, Eye, EyeOff, ArrowRight, ArrowLeft, CheckCircle2, AlertCircle, ShieldCheck, X, Loader2 } from 'lucide-react';

type Mode = 'login' | 'forgot_password' | 'forgot_sent';

// Sample demo directory shown in the "Account details" dialog. Edit freely.
const DEMO_ACCOUNTS = [
  { roleKey: 'Coordinator', title: 'Coordinator', email: 'coordinator.demo@demo.thapar.local', blurb: 'Full solver, rules & publishing', detail: 'Full academic scheduling, solver runs, conflict diagnosis & master publish.' },
  { roleKey: 'Faculty', title: 'Faculty', email: 'faculty.demo@demo.thapar.local', blurb: 'Teaching routine & room schedule', detail: 'Faculty personal routine, class cancellation, substitute cover & availability.' },
  { roleKey: 'Student', title: 'Student', email: 'student.demo@demo.thapar.local', blurb: 'Weekly classes & course details', detail: 'Weekly student schedule, room numbers, faculty info & syllabus tracking.' },
  { roleKey: 'Admin', title: 'College Admin / Dean', email: 'admin.demo@demo.thapar.local', blurb: 'Dean office & master approvals', detail: 'Academic calendar, workload limits, user management & master publication approval.' },
  { roleKey: 'HOD', title: 'Head of Department (HOD)', email: 'hod.demo@demo.thapar.local', blurb: 'Department load balance & syllabus tracking', detail: 'Department load balance, elective allocation & syllabus progress oversight.' },
];

const inputClass =
  'w-full bg-white dark:bg-zinc-950 border border-[#E5E2D9] dark:border-zinc-800 focus:border-[#8C1B2E] focus:ring-1 focus:ring-[#8C1B2E] rounded-xl pl-10 py-2.5 text-xs text-stone-900 dark:text-zinc-100 outline-none transition-all disabled:opacity-50';
const primaryButton =
  'w-full py-2.5 bg-[#8C1B2E] hover:bg-[#721525] active:bg-[#5a111e] disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-lg text-xs font-semibold shadow-xs transition-all flex items-center justify-center gap-2';

export function LoginPageView() {
  const { login, loginAsDemoRole, startGoogleLogin, requestPasswordReset, authConfig } = useAuth();

  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [showDemoModal, setShowDemoModal] = useState(false);

  // Google sign-in redirects back with ?auth_error=... when it fails.
  useEffect(() => {
    const url = new URL(window.location.href);
    const err = url.searchParams.get('auth_error');
    if (err) {
      setErrorMessage(err);
      url.searchParams.delete('auth_error');
      window.history.replaceState({}, '', url.pathname + url.search);
    }
  }, []);

  const switchMode = (m: Mode) => {
    setMode(m);
    setErrorMessage(null);
    setInfoMessage(null);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setBusy('password');
    const r = await login(email.trim(), password);
    setBusy(null);
    if (!r.success) setErrorMessage(r.message ?? 'Sign-in failed.');
  };

  const handleDemo = async (roleKey: string) => {
    setErrorMessage(null);
    setBusy(roleKey);
    const r = await loginAsDemoRole(roleKey);
    setBusy(null);
    if (!r.success) setErrorMessage(r.message ?? 'Demo sign-in failed.');
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy('forgot');
    const r = await requestPasswordReset(email.trim());
    setBusy(null);
    if (r.success) {
      setInfoMessage(r.message ?? null);
      setMode('forgot_sent');
    } else {
      setErrorMessage(r.message ?? 'Request failed.');
    }
  };

  const disabled = busy !== null;
  const domains = authConfig?.allowedDomains?.map((d) => `@${d}`).join(' or ') || '@thapar.edu';

  return (
    <div className="min-h-screen w-full bg-[#F7F6F2] dark:bg-[#0c0c0e] text-stone-900 dark:text-zinc-100 flex flex-col justify-center items-center p-4 sm:p-6 lg:p-8 font-sans relative overflow-x-hidden selection:bg-[#8C1B2E]/20 selection:text-[#8C1B2E]">
      <main className="w-full max-w-[430px] bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-2xl p-6 sm:p-8 shadow-xs relative z-10 transition-all">
        <div className="mb-6 text-center">
          <ThaparLogo size="md" variant="full" />
        </div>

        {errorMessage && (
          <div role="alert" className="mb-4 p-3 bg-rose-50/80 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900/60 rounded-xl text-rose-800 dark:text-rose-300 text-xs flex items-start gap-2.5">
            <AlertCircle className="h-4 w-4 shrink-0 text-[#8C1B2E] dark:text-red-400 mt-0.5" />
            <span className="leading-relaxed font-medium">{errorMessage}</span>
          </div>
        )}

        {mode === 'login' && (
          <div>
            <div className="text-center space-y-1.5 mb-6">
              <h1 className="text-xl font-bold font-serif tracking-tight">Sign in to your account</h1>
              <p className="text-xs text-stone-500 dark:text-zinc-400">
                {authConfig?.googleEnabled ? `Use your ${domains} Google account, or your email and password.` : 'Use your institutional email and password.'}
              </p>
            </div>

            {authConfig?.googleEnabled && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setBusy('google');
                    startGoogleLogin();
                  }}
                  disabled={disabled}
                  className="w-full py-2.5 bg-white dark:bg-zinc-950 hover:bg-stone-50 disabled:opacity-60 text-stone-800 dark:text-zinc-100 border border-[#E5E2D9] dark:border-zinc-700 hover:border-stone-400 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-2.5"
                >
                  {busy === 'google' ? (
                    <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
                  ) : (
                    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                      <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.65v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.14z" />
                      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z" />
                      <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.98 0 12s.45 3.82 1.25 5.42l4.03-3.15z" />
                      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z" />
                    </svg>
                  )}
                  <span>Continue with Google ({domains})</span>
                </button>
                <div className="relative my-5">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-[#E5E2D9] dark:border-zinc-800" />
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="bg-[#FAF9F5] dark:bg-zinc-900 px-3 text-stone-500 dark:text-zinc-400 font-medium">or</span>
                  </div>
                </div>
              </>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="login-email" className="text-xs font-medium text-stone-700 dark:text-zinc-300 block">
                  Email
                </label>
                <div className="relative">
                  <Mail className="h-4 w-4 text-stone-400 absolute left-3.5 top-3" aria-hidden="true" />
                  <input id="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={disabled} autoComplete="username" autoCapitalize="none" spellCheck={false} className={`${inputClass} pr-4`} required />
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <label htmlFor="login-password" className="font-medium text-stone-700 dark:text-zinc-300">
                    Password
                  </label>
                  <button type="button" onClick={() => switchMode('forgot_password')} className="text-[#8C1B2E] dark:text-red-400 hover:text-[#721525] text-[11px] font-medium">
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="h-4 w-4 text-stone-400 absolute left-3.5 top-3" aria-hidden="true" />
                  <input id="login-password" type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} disabled={disabled} autoComplete="current-password" className={`${inputClass} pr-10`} required />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-2.5 text-stone-400 hover:text-stone-600 p-0.5"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <button type="submit" disabled={disabled} className={primaryButton}>
                {busy === 'password' ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Signing in...</span>
                  </>
                ) : (
                  <>
                    <span>Sign In</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>

            {authConfig?.demoEnabled && (
              <div className="mt-6 pt-5 border-t border-[#E5E2D9] dark:border-zinc-800/80">
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    <span className="text-xs font-semibold text-stone-800 dark:text-zinc-200">Demo access</span>
                    <span className="text-[10px] text-amber-700 dark:text-amber-400 font-mono bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-900/40">Public Demo</span>
                  </div>
                  <button type="button" onClick={() => setShowDemoModal(true)} className="text-[11px] text-stone-500 hover:text-stone-800 dark:text-zinc-400 underline">
                    Account details
                  </button>
                </div>
                <p className="text-[11px] text-stone-500 dark:text-zinc-400 mb-3 leading-relaxed">Demo accounts work on the sample data. Click a role to sign in:</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {DEMO_ACCOUNTS.map((a, i) => (
                    <button
                      key={a.roleKey}
                      type="button"
                      onClick={() => handleDemo(a.roleKey)}
                      disabled={disabled}
                      className={`${i === DEMO_ACCOUNTS.length - 1 ? 'sm:col-span-2 ' : ''}p-2.5 bg-white dark:bg-zinc-950 hover:bg-stone-50 disabled:opacity-50 text-left border border-[#E5E2D9] dark:border-zinc-800 hover:border-stone-400 rounded-lg transition-all flex flex-col gap-0.5 group focus:outline-none focus-visible:ring-1 focus-visible:ring-[#8C1B2E]`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="text-xs font-semibold text-stone-900 dark:text-zinc-200 group-hover:text-[#8C1B2E]">Continue as {a.roleKey}</span>
                        {busy === a.roleKey ? <Loader2 className="h-3.5 w-3.5 animate-spin text-stone-400" /> : <ArrowRight className="h-3 w-3 text-stone-400 group-hover:text-[#8C1B2E]" />}
                      </div>
                      <span className="text-[10px] text-stone-500 dark:text-zinc-400">{a.blurb}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <p className="mt-6 pt-5 border-t border-[#E5E2D9] dark:border-zinc-800/80 text-center text-[11px] text-stone-500 dark:text-zinc-400 leading-relaxed">
              {authConfig?.googleEnabled
                ? `First time here? Sign in with your ${domains} Google account. Students and faculty in the institute roster get access automatically.`
                : 'Need an account? Ask the timetable administrator to create one for you.'}
            </p>
          </div>
        )}

        {mode === 'forgot_password' && (
          <div>
            <div className="text-center space-y-1 mb-5">
              <h1 className="text-base font-bold font-serif tracking-tight">Forgot your password?</h1>
              <p className="text-xs text-stone-500 dark:text-zinc-400">Enter your email and we'll tell you how to get back in.</p>
            </div>
            <form onSubmit={handleForgot} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="forgot-email" className="text-xs font-medium text-stone-700 dark:text-zinc-300 block">
                  Email
                </label>
                <div className="relative">
                  <Mail className="h-4 w-4 text-stone-400 absolute left-3.5 top-3" aria-hidden="true" />
                  <input id="forgot-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={disabled} autoComplete="username" className={`${inputClass} pr-4`} required />
                </div>
              </div>
              <button type="submit" disabled={disabled} className={primaryButton}>
                {busy === 'forgot' ? <Loader2 className="h-4 w-4 animate-spin" /> : <span>Continue</span>}
              </button>
            </form>
            <BackToLogin onClick={() => switchMode('login')} />
          </div>
        )}

        {mode === 'forgot_sent' && (
          <div className="text-center space-y-4">
            <CheckCircle2 className="h-8 w-8 text-emerald-600 mx-auto" aria-hidden="true" />
            <p role="status" className="text-xs text-stone-600 dark:text-zinc-300 leading-relaxed">
              {infoMessage}
            </p>
            <BackToLogin onClick={() => switchMode('login')} />
          </div>
        )}
      </main>

      <footer className="mt-6 text-center text-xs text-stone-500 dark:text-zinc-500">Thapar Institute of Engineering & Technology · Timetable Portal</footer>

      {showDemoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 dark:bg-black/80 backdrop-blur-xs" onClick={() => setShowDemoModal(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="demo-dialog-title"
            onClick={(e) => e.stopPropagation()}
            className="bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-2xl max-w-lg w-full p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-[#E5E2D9] dark:border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                <div>
                  <h2 id="demo-dialog-title" className="text-sm font-bold font-serif">Public Demo Directory</h2>
                  <p className="text-[11px] text-stone-500 dark:text-zinc-400">Pre-seeded accounts for review</p>
                </div>
              </div>
              <button type="button" onClick={() => setShowDemoModal(false)} aria-label="Close" className="p-1 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 dark:hover:bg-zinc-800">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 text-[11px] text-amber-900 dark:text-amber-200/90 leading-relaxed">
              <span className="font-semibold">Shared demo password:</span>{' '}
              <code className="bg-white dark:bg-zinc-950 px-1.5 py-0.5 rounded font-mono border border-amber-300 dark:border-amber-800/40">ThaparDemo@2026Test!</code> (unless the administrator changed it). Or click a demo button to sign in directly.
            </div>
            <div className="space-y-2">
              {DEMO_ACCOUNTS.map((a) => (
                <div key={a.email} className="p-3 bg-white dark:bg-zinc-950 rounded-xl border border-[#E5E2D9] dark:border-zinc-800/80 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold">{a.title}</span>
                    <span className="text-[10px] font-mono text-stone-500 dark:text-zinc-400">{a.email}</span>
                  </div>
                  <p className="text-[11px] text-stone-500 dark:text-zinc-400">{a.detail}</p>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => setShowDemoModal(false)} className="w-full py-2 bg-stone-200 dark:bg-zinc-800 hover:bg-stone-300 text-xs font-semibold rounded-lg">
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function BackToLogin({ onClick }: { onClick: () => void }) {
  return (
    <div className="pt-4 text-center">
      <button type="button" onClick={onClick} className="inline-flex items-center gap-1.5 text-xs text-stone-500 dark:text-zinc-400 hover:text-stone-800">
        <ArrowLeft className="h-3.5 w-3.5" />
        <span>Back to sign in</span>
      </button>
    </div>
  );
}
