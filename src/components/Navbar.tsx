import React, { useState } from 'react';
import { useTimetable } from '../context/TimetableContext';
import { useAuth } from '../context/AuthContext';
import { ThaparLogo } from './ThaparLogo';
import { getUserInitials } from '../lib/userUtils';
import {
  Bell,
  Menu,
  X,
  User,
  LogOut,
  AlertTriangle
} from 'lucide-react';

interface NavbarProps {
  onOpenInbox: () => void;
  onOpenAuth: () => void;
  onOpenProfile: () => void;
  onShowLoginPage: () => void;
  isMobileNavOpen?: boolean;
  onToggleMobileNav?: () => void;
}

export function Navbar({
  onOpenInbox,
  onOpenProfile,
  onShowLoginPage,
  isMobileNavOpen,
  onToggleMobileNav,
}: NavbarProps) {
  const {
    currentRole,
    notifications,
    health,
    activeView,
    resetDemoAcademicData,
  } = useTimetable();

  const { currentUser, currentRole: authRole, logout, resetDemoData } = useAuth();
  const [isResetting, setIsResetting] = useState(false);
  const [showConfirmLogout, setShowConfirmLogout] = useState(false);

  const unreadCount = notifications.filter(n => !n.read).length;

  const handleConfirmSignOut = () => {
    setShowConfirmLogout(false);
    logout();
    onShowLoginPage();
  };

  const handleResetDemo = async () => {
    setIsResetting(true);
    try {
      await resetDemoData();
      resetDemoAcademicData();
    } finally {
      setIsResetting(false);
    }
  };

  const getViewTitle = () => {
    switch (activeView) {
      case 'overview':
        return 'Operations Hub';
      case 'grid':
        return 'Timetable Grid';
      case 'recovery':
        return 'Self-Healing Engine';
      case 'whatif':
        return 'Scenario Simulator';
      case 'solvers':
        return 'Optimization Solvers';
      case 'syllabus':
        return 'Workload & Syllabus';
      case 'faculty_portal':
        return 'Faculty Routine';
      case 'student_portal':
        return 'Student Schedule';
      case 'governance':
        return 'Audit & Versions';
      case 'auth_gov':
        return 'Access Directory';
      default:
        return 'Operations';
    }
  };

  return (
    <header className="h-14 sm:h-15 bg-[#F7F6F2] dark:bg-zinc-950/95 border-b border-[#E5E2D9] dark:border-zinc-800/80 px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30 backdrop-blur-md">
      {/* Left: Mobile Menu Toggle + Logo + Short Title */}
      <div className="flex items-center gap-3">
        {onToggleMobileNav && (
          <button
            onClick={onToggleMobileNav}
            aria-label={isMobileNavOpen ? 'Close navigation menu' : 'Open navigation menu'}
            className="lg:hidden p-2 -ml-1 text-stone-600 hover:text-stone-900 hover:bg-stone-100 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-900 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8C1B2E]"
          >
            {isMobileNavOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        )}

        <div className="flex items-center gap-2.5">
          <ThaparLogo size="sm" variant="mark-only" />
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-serif font-bold text-stone-900 dark:text-zinc-100 tracking-tight leading-none">
                Thapar Timetable
              </span>
              <span className="hidden sm:inline text-stone-400 dark:text-zinc-600 text-xs font-normal">/</span>
              <span className="hidden sm:inline text-xs text-stone-600 dark:text-zinc-400 font-medium">
                {getViewTitle()}
              </span>
            </div>
            <span className="sm:hidden text-[11px] text-stone-500 dark:text-zinc-400 leading-tight">
              {getViewTitle()}
            </span>
          </div>
        </div>
      </div>

      {/* Right: Health KPI + Notifications + Profile Button */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Public Demo Indicator & Reset Button */}
        {currentUser?.isDemoUser && (
          <div className="flex items-center gap-1.5 sm:gap-2 px-2.5 py-1 rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-[11px] text-amber-800 dark:text-amber-200">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
            <span className="font-medium hidden sm:inline">Public Demo</span>
            <button
              onClick={handleResetDemo}
              disabled={isResetting}
              className="text-[10px] text-amber-700 dark:text-amber-300 hover:text-stone-900 dark:hover:text-white font-semibold underline transition-colors disabled:opacity-50"
              title="Revert demo modifications and restore pristine demo dataset"
            >
              {isResetting ? 'Restoring...' : 'Reset Demo Data'}
            </button>
          </div>
        )}

        {/* Schedule Health Pill (Desktop) */}
        <div className="hidden md:flex items-center gap-2 px-2.5 py-1 rounded-md bg-white dark:bg-zinc-900/80 border border-[#E5E2D9] dark:border-zinc-800/80 text-[11px] text-stone-700 dark:text-zinc-300 shadow-2xs">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 dark:bg-emerald-400 animate-pulse" />
          <span>Health</span>
          <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
            {health.overallScore}%
          </span>
        </div>

        {/* Notifications Button */}
        <button
          onClick={onOpenInbox}
          aria-label={`Open notifications (${unreadCount} unread)`}
          className="relative p-2 rounded-lg text-stone-600 hover:text-stone-900 hover:bg-stone-100 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-900 border border-transparent hover:border-[#E5E2D9] dark:hover:border-zinc-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8C1B2E]"
          title="Notifications & Alerts"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#8C1B2E] ring-2 ring-[#F7F6F2] dark:ring-zinc-950" />
          )}
        </button>

        {/* User Profile & Account Trigger */}
        <div className="flex items-center gap-1.5 pl-1 sm:pl-2 sm:border-l sm:border-[#E5E2D9] dark:border-zinc-800/80">
          <button
            onClick={onOpenProfile}
            aria-label="Open user profile settings"
            className="flex items-center gap-2 p-1 sm:px-2.5 sm:py-1 rounded-lg hover:bg-stone-100 dark:hover:bg-zinc-900 border border-transparent hover:border-[#E5E2D9] dark:hover:border-zinc-800/80 transition-colors text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8C1B2E]"
          >
            <div className="w-7 h-7 rounded-full bg-[#8C1B2E] text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs">
              {getUserInitials(currentUser?.name)}
            </div>
            <div className="hidden sm:flex flex-col">
              <span className="text-xs font-semibold text-stone-900 dark:text-zinc-200 leading-tight max-w-[120px] truncate">
                {currentUser?.name || 'User'}
              </span>
              <span className="text-[10px] text-stone-500 dark:text-zinc-400 leading-tight">
                {authRole?.name || currentRole}
              </span>
            </div>
          </button>

          <button
            onClick={() => setShowConfirmLogout(true)}
            aria-label="Sign out"
            className="p-1.5 text-stone-500 hover:text-[#8C1B2E] hover:bg-[#8C1B2E]/10 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8C1B2E]"
            title="Sign Out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Confirmation Modal for Sign Out */}
      {showConfirmLogout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl max-w-sm w-full p-5 shadow-xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-950/80 border border-amber-200 dark:border-amber-800/60 text-amber-700 dark:text-amber-400 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-serif font-bold text-stone-900 dark:text-white">Sign Out Confirmation</h3>
                <p className="text-xs text-stone-500 dark:text-zinc-400">Are you sure you want to end your active session?</p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E5E2D9] dark:border-zinc-800/80">
              <button
                type="button"
                onClick={() => setShowConfirmLogout(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-stone-600 dark:text-zinc-300 hover:bg-stone-100 dark:hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmSignOut}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-[#8C1B2E] hover:bg-[#721524] text-white shadow-2xs transition-colors"
              >
                Confirm Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
