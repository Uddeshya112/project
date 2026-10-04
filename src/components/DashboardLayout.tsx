import React, { useState, useEffect } from 'react';
import { useTimetable } from '../context/TimetableContext';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { ThaparLogo } from './ThaparLogo';
import { getUserInitials } from '../lib/userUtils';
import { Sidebar } from './Sidebar';
import { AcademicInboxModal } from './modals/AcademicInboxModal';
import { UserProfileModal } from './modals/UserProfileModal';

// Views
import { CoordinatorView } from './views/CoordinatorView';
import { TimetableGridView } from './views/TimetableGridView';
import { RecoveryEngineView } from './views/RecoveryEngineView';
import { FacultyPortalView } from './views/FacultyPortalView';
import { StudentPortalView } from './views/StudentPortalView';
import { CRPortalView } from './views/CRPortalView';
import { AdminPortalView } from './views/AdminPortalView';
import { GovernanceView } from './views/GovernanceView';
import { AcademicSetupHubView } from './views/AcademicSetupHubView';
import { GenerateTimetablePage } from './views/GenerateTimetablePage';

import {
  Menu,
  Bell,
  User,
  LogOut,
  ChevronDown,
  ArrowRightLeft,
  Check,
  Sun,
  Moon
} from 'lucide-react';

interface DashboardLayoutProps {
  onSignOutToLogin: () => void;
  onOpenWorkspacePicker?: () => void;
}

export function DashboardLayout({
  onSignOutToLogin,
}: DashboardLayoutProps) {
  const {
    activeView,
    setActiveView,
    setCurrentRole,
    notifications,
  } = useTimetable();

  const {
    currentUser,
    logout,
    currentWorkspace,
    authorizedWorkspaces,
    switchWorkspace,
  } = useAuth();

  const { theme, toggleTheme } = useTheme();

  // Navigation & Modals state
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [showWorkspaceMenu, setShowWorkspaceMenu] = useState(false);

  const unreadCount = notifications.filter(n => !n.read).length;

  // Auto-sync activeView when currentWorkspace changes
  useEffect(() => {
    switch (currentWorkspace) {
      case 'Student':
        setActiveView('student_portal');
        setCurrentRole('Student');
        break;
      case 'CR':
        setActiveView('student_portal');
        setCurrentRole('Student');
        break;
      case 'Faculty':
        setActiveView('faculty_portal');
        setCurrentRole('Faculty');
        break;
      case 'Coordinator':
        setActiveView('overview');
        setCurrentRole('Coordinator');
        break;
      case 'Admin':
        setActiveView('governance');
        setCurrentRole('Admin');
        break;
    }
  }, [currentWorkspace]);

  // Close menus on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsMobileNavOpen(false);
        setShowWorkspaceMenu(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSignOut = () => {
    logout();
    onSignOutToLogin();
  };

  const getWorkspaceTitle = () => {
    switch (currentWorkspace) {
      case 'Student': return 'Student Portal';
      case 'CR': return 'Class Representative Portal';
      case 'Faculty': return 'Faculty Portal';
      case 'Coordinator': return 'Coordinator';
      case 'Admin': return 'Operations & Governance';
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F6F2] dark:bg-[#0c0c0e] text-stone-900 dark:text-zinc-100 flex flex-col font-sans antialiased">
      {/* 1. Compact Enterprise Header */}
      <header className="h-12 bg-[#FAF9F5] dark:bg-zinc-900 border-b border-[#E5E2D9] dark:border-zinc-800 px-3 sm:px-5 flex items-center justify-between sticky top-0 z-30">
        {/* Left: Mobile Drawer Trigger + Brand + Role Context */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setIsMobileNavOpen(!isMobileNavOpen)}
            aria-label={isMobileNavOpen ? 'Close navigation menu' : 'Open navigation menu'}
            className="md:hidden p-1.5 text-stone-600 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-white rounded transition-colors"
          >
            <Menu className="h-4 w-4" />
          </button>

          <div className="flex items-center gap-2">
            <ThaparLogo size="sm" variant="mark-only" />
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-stone-900 dark:text-zinc-100 tracking-tight">
                Thapar Timetable
              </span>
              {currentWorkspace !== 'Student' && (
                <>
                  <span className="text-stone-400 dark:text-zinc-600 text-xs">/</span>
                  <span className="text-xs text-stone-600 dark:text-zinc-400 font-medium">
                    {getWorkspaceTitle()}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right: Multi-Role Switcher + Theme Toggle + Notifications + User Profile */}
        <div className="flex items-center gap-2">
          {/* Quick Workspace Switcher */}
          {authorizedWorkspaces.length > 1 && (
            <div className="relative hidden sm:block">
              <button
                onClick={() => setShowWorkspaceMenu(!showWorkspaceMenu)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-white dark:bg-zinc-800 border border-[#E5E2D9] dark:border-zinc-700 text-[11px] font-medium text-stone-700 dark:text-zinc-300 hover:text-stone-900 dark:hover:text-white transition-colors shadow-2xs"
              >
                <ArrowRightLeft className="h-3 w-3 text-[#8C1B2E] dark:text-red-400" />
                <span>{currentWorkspace === 'CR' ? 'Class Rep' : currentWorkspace}</span>
                <ChevronDown className="h-3 w-3 text-stone-400" />
              </button>

              {showWorkspaceMenu && (
                <div className="absolute right-0 mt-1 w-44 bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-lg shadow-lg p-1 z-40 space-y-0.5">
                  <div className="px-2 py-0.5 text-[10px] font-mono text-stone-400 dark:text-zinc-500 uppercase tracking-wider">
                    Switch Workspace
                  </div>
                  {authorizedWorkspaces.map(ws => (
                    <button
                      key={ws}
                      onClick={() => {
                        switchWorkspace(ws);
                        setShowWorkspaceMenu(false);
                      }}
                      className={`w-full text-left px-2 py-1 rounded-md text-xs font-medium transition-colors flex items-center justify-between ${
                        currentWorkspace === ws
                          ? 'bg-[#8C1B2E] text-white font-semibold'
                          : 'text-stone-700 dark:text-zinc-300 hover:bg-stone-100 dark:hover:bg-zinc-800'
                      }`}
                    >
                      <span>{ws === 'CR' ? 'Class Representative' : `${ws} Portal`}</span>
                      {currentWorkspace === ws && <Check className="h-3.5 w-3.5 text-white" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Theme Toggle Button */}
          <button
            onClick={toggleTheme}
            className="p-1.5 rounded-md text-stone-600 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-white hover:bg-stone-100 dark:hover:bg-zinc-800 transition-colors"
            title="Toggle Light / Dark Theme"
          >
            {theme === 'dark' ? <Sun className="h-3.5 w-3.5 text-amber-400" /> : <Moon className="h-3.5 w-3.5 text-stone-600" />}
          </button>

          {/* Notifications Button */}
          <button
            onClick={() => setInboxOpen(true)}
            aria-label={`Open notifications (${unreadCount} unread)`}
            className="relative p-1.5 rounded-md text-stone-600 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-white hover:bg-stone-100 dark:hover:bg-zinc-800 transition-colors"
            title="Notifications & Alerts"
          >
            <Bell className="h-3.5 w-3.5" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[#8C1B2E] ring-2 ring-white dark:ring-zinc-900" />
            )}
          </button>

          {/* User Profile & Sign Out */}
          <div className="flex items-center gap-1 pl-2 border-l border-[#E5E2D9] dark:border-zinc-800">
            <button
              onClick={() => setProfileModalOpen(true)}
              className="flex items-center gap-1.5 p-1 rounded-md hover:bg-stone-100 dark:hover:bg-zinc-800 transition-colors text-left"
            >
              <div className="w-5 h-5 rounded-full bg-[#8C1B2E]/10 text-[#8C1B2E] border border-[#8C1B2E]/30 flex items-center justify-center font-bold text-[10px] shrink-0">
                {getUserInitials(currentUser?.name)}
              </div>
              <span className="hidden sm:inline text-xs font-semibold text-stone-700 dark:text-zinc-300 max-w-[120px] truncate">
                {currentUser?.name || 'User'}
              </span>
            </button>

            <button
              onClick={handleSignOut}
              className="p-1 text-stone-400 hover:text-[#8C1B2E] dark:text-zinc-400 dark:hover:text-red-400 transition-colors"
              title="Sign Out"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* 2. Main Body: Sidebar + Main Workspace Content */}
      <div className="flex-1 flex overflow-hidden relative">
        <Sidebar
          isOpen={isMobileNavOpen}
          onClose={() => setIsMobileNavOpen(false)}
          onOpenProfile={() => setProfileModalOpen(true)}
          onOpenNotifications={() => setInboxOpen(true)}
          onShowLoginPage={onSignOutToLogin}
        />

        {/* Main Workspace */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 bg-[#F7F6F2] dark:bg-[#0c0c0e]">
          {currentWorkspace === 'Student' && <StudentPortalView />}
          {currentWorkspace === 'CR' && <CRPortalView />}
          {currentWorkspace === 'Faculty' && <FacultyPortalView />}
          {currentWorkspace === 'Admin' && <AdminPortalView />}

          {currentWorkspace === 'Coordinator' && (
            <>
              {activeView === 'overview' && <CoordinatorView />}
              {activeView === 'grid' && <TimetableGridView />}
              {activeView === 'academic_setup' && <AcademicSetupHubView />}
              {activeView === 'academic_year' && <AcademicSetupHubView />}
              {activeView === 'departments' && <AcademicSetupHubView />}
              {activeView === 'courses_mgmt' && <AcademicSetupHubView />}
              {activeView === 'faculty_mgmt' && <AcademicSetupHubView />}
              {activeView === 'rooms_mgmt' && <AcademicSetupHubView />}
              {activeView === 'sections_mgmt' && <AcademicSetupHubView />}
              {activeView === 'allocations' && <AcademicSetupHubView />}
              {activeView === 'availability' && <AcademicSetupHubView />}
              {activeView === 'generation_validator' && <GenerateTimetablePage />}
              {activeView === 'recovery' && <RecoveryEngineView />}
              {activeView === 'governance' && <GovernanceView />}
            </>
          )}

          <footer className="mt-8 pt-4 border-t border-[#E5E2D9] dark:border-zinc-800/80 text-center text-[11px] text-stone-500 dark:text-zinc-500">
            Thapar Institute of Engineering & Technology · Academic Timetable & Class Operations System
          </footer>
        </main>
      </div>

      {/* Global Modals */}
      {inboxOpen && <AcademicInboxModal isOpen={inboxOpen} onClose={() => setInboxOpen(false)} />}
      {profileModalOpen && (
        <UserProfileModal
          isOpen={profileModalOpen}
          onClose={() => setProfileModalOpen(false)}
        />
      )}
    </div>
  );
}
