import React, { useState, useEffect } from 'react';
import { useTimetable, ViewTab } from '../context/TimetableContext';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { ThaparLogo } from './ThaparLogo';
import { getUserInitials } from '../lib/userUtils';
import {
  ChevronDown,
  ChevronRight,
  LogOut,
  X,
  User,
  Sun,
  Moon,
  Calendar,
  BookOpen,
  Users,
  Clock,
  Bell,
  Settings,
  Shield,
  Layers,
  Sparkles
} from 'lucide-react';

interface SidebarProps {
  onOpenProfile?: () => void;
  onOpenNotifications?: () => void;
  onShowLoginPage?: () => void;
  isOpen?: boolean;
  onClose?: () => void;
}

export function Sidebar({
  onOpenProfile,
  onOpenNotifications,
  onShowLoginPage,
  isOpen = false,
  onClose,
}: SidebarProps = {}) {
  const { activeView, setActiveView } = useTimetable();
  const { currentUser, currentWorkspace, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const isSetupActive = ['academic_year', 'departments', 'courses_mgmt', 'faculty_mgmt', 'rooms_mgmt', 'sections_mgmt', 'academic_setup'].includes(activeView);
  const isTimetableActive = ['allocations', 'availability', 'generation_validator', 'grid'].includes(activeView);
  const isReviewActive = ['governance', 'recovery'].includes(activeView);

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    setup: isSetupActive,
    timetable: isTimetableActive,
    review: isReviewActive,
  });

  useEffect(() => {
    setExpandedGroups(prev => ({
      ...prev,
      setup: isSetupActive || prev.setup,
      timetable: isTimetableActive || prev.timetable,
      review: isReviewActive || prev.review,
    }));
  }, [activeView]);

  const toggleGroup = (groupKey: string) => {
    setExpandedGroups(prev => ({ ...prev, [groupKey]: !prev[groupKey] }));
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && onClose) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleSelect = (view: ViewTab) => {
    setActiveView(view);
    if (onClose) onClose();
  };

  const isStudent = currentWorkspace === 'Student' || currentWorkspace === 'CR';
  const isFaculty = currentWorkspace === 'Faculty';
  const isCoordinator = currentWorkspace === 'Coordinator';
  const isAdmin = currentWorkspace === 'Admin';

  const navContent = (
    <div className="flex flex-col h-full bg-[#FAF9F5] dark:bg-zinc-900 border-r border-[#E5E2D9] dark:border-zinc-800 text-stone-700 dark:text-zinc-300 w-60 select-none text-xs font-medium">
      {/* Brand Header */}
      <div className="p-3.5 border-b border-[#E5E2D9] dark:border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <ThaparLogo size="sm" variant="mark-only" />
          <div>
            <h2 className="text-xs font-bold text-stone-900 dark:text-zinc-100 leading-none">
              Thapar Timetable
            </h2>
            <p className="text-[10px] text-stone-500 dark:text-zinc-400 mt-0.5 font-medium">
              {isStudent ? 'Academic Schedule' : isFaculty ? 'Faculty Portal' : isAdmin ? 'Admin Console' : 'Coordinator'}
            </p>
          </div>
        </div>

        {onClose && (
          <button
            onClick={onClose}
            className="p-1 rounded text-stone-500 hover:text-stone-900 dark:text-zinc-400 dark:hover:text-zinc-100 md:hidden"
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Navigation Items (Role-Specific Architecture) */}
      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-2">
        {/* STUDENT NAVIGATION */}
        {isStudent && (
          <div className="space-y-1">
            <button
              onClick={() => handleSelect('overview')}
              className={`w-full text-left px-3 py-2 rounded-lg transition-all font-medium flex items-center gap-2 ${
                activeView === 'overview'
                  ? 'bg-[#8C1B2E] text-white font-semibold shadow-xs'
                  : 'hover:bg-stone-100 dark:hover:bg-zinc-800 text-stone-800 dark:text-zinc-200'
              }`}
            >
              <Calendar className="h-4 w-4 shrink-0" />
              <span>Dashboard</span>
            </button>

            <button
              onClick={() => handleSelect('grid')}
              className={`w-full text-left px-3 py-2 rounded-lg transition-all font-medium flex items-center gap-2 ${
                activeView === 'grid'
                  ? 'bg-[#8C1B2E] text-white font-semibold shadow-xs'
                  : 'hover:bg-stone-100 dark:hover:bg-zinc-800 text-stone-800 dark:text-zinc-200'
              }`}
            >
              <Clock className="h-4 w-4 shrink-0" />
              <span>My Timetable</span>
            </button>

            <button
              onClick={() => handleSelect('student_courses')}
              className={`w-full text-left px-3 py-2 rounded-lg transition-all font-medium flex items-center gap-2 ${
                activeView === 'student_courses'
                  ? 'bg-[#8C1B2E] text-white font-semibold shadow-xs'
                  : 'hover:bg-stone-100 dark:hover:bg-zinc-800 text-stone-800 dark:text-zinc-200'
              }`}
            >
              <BookOpen className="h-4 w-4 shrink-0" />
              <span>My Courses</span>
            </button>

            <button
              onClick={() => handleSelect('student_section')}
              className={`w-full text-left px-3 py-2 rounded-lg transition-all font-medium flex items-center gap-2 ${
                activeView === 'student_section'
                  ? 'bg-[#8C1B2E] text-white font-semibold shadow-xs'
                  : 'hover:bg-stone-100 dark:hover:bg-zinc-800 text-stone-800 dark:text-zinc-200'
              }`}
            >
              <Users className="h-4 w-4 shrink-0" />
              <span>My Section</span>
            </button>

            <button
              onClick={() => {
                if (onOpenNotifications) onOpenNotifications();
                if (onClose) onClose();
              }}
              className="w-full text-left px-3 py-2 rounded-lg transition-all font-medium text-stone-700 dark:text-zinc-300 hover:bg-stone-100 dark:hover:bg-zinc-800 flex items-center gap-2"
            >
              <Bell className="h-4 w-4 shrink-0 text-stone-500" />
              <span>Notifications</span>
            </button>

            <button
              onClick={() => {
                if (onOpenProfile) onOpenProfile();
                if (onClose) onClose();
              }}
              className="w-full text-left px-3 py-2 rounded-lg transition-all font-medium text-stone-700 dark:text-zinc-300 hover:bg-stone-100 dark:hover:bg-zinc-800 flex items-center gap-2"
            >
              <User className="h-4 w-4 shrink-0 text-stone-500" />
              <span>Profile</span>
            </button>
          </div>
        )}

        {/* FACULTY NAVIGATION */}
        {isFaculty && (
          <div className="space-y-1">
            <button
              onClick={() => handleSelect('overview')}
              className={`w-full text-left px-3 py-2 rounded-lg transition-all font-medium flex items-center gap-2 ${
                activeView === 'overview' || activeView === 'faculty_portal'
                  ? 'bg-[#8C1B2E] text-white font-semibold shadow-xs'
                  : 'hover:bg-stone-100 dark:hover:bg-zinc-800 text-stone-800 dark:text-zinc-200'
              }`}
            >
              <Calendar className="h-4 w-4 shrink-0" />
              <span>Dashboard</span>
            </button>

            <button
              onClick={() => handleSelect('grid')}
              className={`w-full text-left px-3 py-2 rounded-lg transition-all font-medium flex items-center gap-2 ${
                activeView === 'grid'
                  ? 'bg-[#8C1B2E] text-white font-semibold shadow-xs'
                  : 'hover:bg-stone-100 dark:hover:bg-zinc-800 text-stone-800 dark:text-zinc-200'
              }`}
            >
              <Clock className="h-4 w-4 shrink-0" />
              <span>My Timetable</span>
            </button>

            <button
              onClick={() => handleSelect('availability')}
              className={`w-full text-left px-3 py-2 rounded-lg transition-all font-medium flex items-center gap-2 ${
                activeView === 'availability'
                  ? 'bg-[#8C1B2E] text-white font-semibold shadow-xs'
                  : 'hover:bg-stone-100 dark:hover:bg-zinc-800 text-stone-800 dark:text-zinc-200'
              }`}
            >
              <User className="h-4 w-4 shrink-0" />
              <span>My Availability</span>
            </button>
          </div>
        )}

        {/* COORDINATOR NAVIGATION */}
        {isCoordinator && (
          <div className="space-y-2">
            <div>
              <button
                onClick={() => handleSelect('overview')}
                className={`w-full text-left px-3 py-2 rounded-lg transition-all font-medium flex items-center gap-2 ${
                  activeView === 'overview'
                    ? 'bg-[#8C1B2E] text-white font-semibold shadow-xs'
                    : 'hover:bg-stone-100 dark:hover:bg-zinc-800 text-stone-800 dark:text-zinc-200'
                }`}
              >
                <Calendar className="h-4 w-4 shrink-0" />
                <span>Dashboard</span>
              </button>
            </div>

            {/* Academic Setup Group */}
            <div className="space-y-0.5">
              <button
                onClick={() => toggleGroup('setup')}
                className="w-full flex items-center justify-between px-2.5 py-1.5 text-[11px] font-bold text-stone-500 dark:text-zinc-400 hover:text-stone-800 dark:hover:text-zinc-200 uppercase tracking-wider"
              >
                <span>Academic Setup</span>
                {expandedGroups.setup ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              </button>

              {expandedGroups.setup && (
                <div className="pl-2.5 space-y-0.5 border-l border-[#E5E2D9] dark:border-zinc-800 ml-2">
                  <button onClick={() => handleSelect('academic_setup')} className={`w-full text-left px-2.5 py-1.5 rounded-md transition-colors ${activeView === 'academic_setup' ? 'text-[#8C1B2E] dark:text-red-400 font-semibold' : 'hover:bg-stone-100 dark:hover:bg-zinc-800 text-stone-700 dark:text-zinc-300 font-medium'}`}>Master Setup & Excel</button>
                  <button onClick={() => handleSelect('academic_year')} className={`w-full text-left px-2.5 py-1.5 rounded-md transition-colors ${activeView === 'academic_year' ? 'text-[#8C1B2E] dark:text-red-400 font-semibold' : 'hover:bg-stone-100 dark:hover:bg-zinc-800 text-stone-700 dark:text-zinc-300'}`}>Academic Year</button>
                  <button onClick={() => handleSelect('departments')} className={`w-full text-left px-2.5 py-1.5 rounded-md transition-colors ${activeView === 'departments' ? 'text-[#8C1B2E] dark:text-red-400 font-semibold' : 'hover:bg-stone-100 dark:hover:bg-zinc-800 text-stone-700 dark:text-zinc-300'}`}>Departments</button>
                  <button onClick={() => handleSelect('courses_mgmt')} className={`w-full text-left px-2.5 py-1.5 rounded-md transition-colors ${activeView === 'courses_mgmt' ? 'text-[#8C1B2E] dark:text-red-400 font-semibold' : 'hover:bg-stone-100 dark:hover:bg-zinc-800 text-stone-700 dark:text-zinc-300'}`}>Courses</button>
                  <button onClick={() => handleSelect('faculty_mgmt')} className={`w-full text-left px-2.5 py-1.5 rounded-md transition-colors ${activeView === 'faculty_mgmt' ? 'text-[#8C1B2E] dark:text-red-400 font-semibold' : 'hover:bg-stone-100 dark:hover:bg-zinc-800 text-stone-700 dark:text-zinc-300'}`}>Faculty</button>
                  <button onClick={() => handleSelect('rooms_mgmt')} className={`w-full text-left px-2.5 py-1.5 rounded-md transition-colors ${activeView === 'rooms_mgmt' ? 'text-[#8C1B2E] dark:text-red-400 font-semibold' : 'hover:bg-stone-100 dark:hover:bg-zinc-800 text-stone-700 dark:text-zinc-300'}`}>Rooms & Labs</button>
                  <button onClick={() => handleSelect('sections_mgmt')} className={`w-full text-left px-2.5 py-1.5 rounded-md transition-colors ${activeView === 'sections_mgmt' ? 'text-[#8C1B2E] dark:text-red-400 font-semibold' : 'hover:bg-stone-100 dark:hover:bg-zinc-800 text-stone-700 dark:text-zinc-300'}`}>Groups & Subgroups</button>
                </div>
              )}
            </div>

            {/* Timetable Group */}
            <div className="space-y-0.5">
              <button
                onClick={() => toggleGroup('timetable')}
                className="w-full flex items-center justify-between px-2.5 py-1.5 text-[11px] font-bold text-stone-500 dark:text-zinc-400 hover:text-stone-800 dark:hover:text-zinc-200 uppercase tracking-wider"
              >
                <span>Timetable Management</span>
                {expandedGroups.timetable ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              </button>

              {expandedGroups.timetable && (
                <div className="pl-2.5 space-y-0.5 border-l border-[#E5E2D9] dark:border-zinc-800 ml-2">
                  <button onClick={() => handleSelect('allocations')} className={`w-full text-left px-2.5 py-1.5 rounded-md transition-colors ${activeView === 'allocations' ? 'text-[#8C1B2E] dark:text-red-400 font-semibold' : 'hover:bg-stone-100 dark:hover:bg-zinc-800 text-stone-700 dark:text-zinc-300'}`}>Course Allocations</button>
                  <button onClick={() => handleSelect('availability')} className={`w-full text-left px-2.5 py-1.5 rounded-md transition-colors ${activeView === 'availability' ? 'text-[#8C1B2E] dark:text-red-400 font-semibold' : 'hover:bg-stone-100 dark:hover:bg-zinc-800 text-stone-700 dark:text-zinc-300'}`}>Faculty Availability</button>
                  <button onClick={() => handleSelect('generation_validator')} className={`w-full text-left px-2.5 py-1.5 rounded-md transition-colors ${activeView === 'generation_validator' ? 'text-[#8C1B2E] dark:text-red-400 font-semibold' : 'text-[#8C1B2E] dark:text-red-400 font-medium hover:bg-stone-100 dark:hover:bg-zinc-800'}`}>Generate Timetable</button>
                  <button onClick={() => handleSelect('grid')} className={`w-full text-left px-2.5 py-1.5 rounded-md transition-colors ${activeView === 'grid' ? 'text-[#8C1B2E] dark:text-red-400 font-semibold' : 'hover:bg-stone-100 dark:hover:bg-zinc-800 text-stone-700 dark:text-zinc-300'}`}>Timetable Grid</button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ADMIN NAVIGATION */}
        {isAdmin && (
          <div className="space-y-1">
            <button
              onClick={() => handleSelect('overview')}
              className={`w-full text-left px-3 py-2 rounded-lg transition-all font-medium flex items-center gap-2 ${
                activeView === 'overview'
                  ? 'bg-[#8C1B2E] text-white font-semibold shadow-xs'
                  : 'hover:bg-stone-100 dark:hover:bg-zinc-800 text-stone-800 dark:text-zinc-200'
              }`}
            >
              <Shield className="h-4 w-4 shrink-0" />
              <span>Admin Console</span>
            </button>

            <button
              onClick={() => handleSelect('governance')}
              className={`w-full text-left px-3 py-2 rounded-lg transition-all font-medium flex items-center gap-2 ${
                activeView === 'governance'
                  ? 'bg-[#8C1B2E] text-white font-semibold shadow-xs'
                  : 'hover:bg-stone-100 dark:hover:bg-zinc-800 text-stone-800 dark:text-zinc-200'
              }`}
            >
              <Layers className="h-4 w-4 shrink-0" />
              <span>Master Approvals</span>
            </button>
          </div>
        )}
      </div>

      {/* Footer Settings & User Info */}
      <div className="p-2.5 border-t border-[#E5E2D9] dark:border-zinc-800 bg-[#F4F2EC] dark:bg-zinc-950/60 space-y-1.5">
        <div className="flex items-center justify-between px-2 py-1">
          <button
            onClick={toggleTheme}
            className="flex items-center gap-1.5 text-[11px] text-stone-600 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-100 transition-colors font-medium"
            title="Toggle Light / Dark Theme"
          >
            {theme === 'dark' ? <Sun className="h-3.5 w-3.5 text-amber-400" /> : <Moon className="h-3.5 w-3.5 text-stone-600" />}
            <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
          </button>
        </div>

        <div className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-6 h-6 rounded-full bg-[#8C1B2E]/10 text-[#8C1B2E] border border-[#8C1B2E]/30 flex items-center justify-center font-bold text-[10px] shrink-0">
              {getUserInitials(currentUser?.name)}
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-semibold text-stone-900 dark:text-zinc-200 truncate">
                {currentUser?.name || 'User'}
              </div>
              <div className="text-[10px] text-stone-500 truncate capitalize">
                {currentWorkspace}
              </div>
            </div>
          </div>

          <button
            onClick={() => {
              logout();
              if (onShowLoginPage) onShowLoginPage();
            }}
            className="p-1 text-stone-400 hover:text-[#8C1B2E] dark:text-zinc-400 dark:hover:text-red-400 rounded transition-colors"
            title="Sign out"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden md:block h-screen sticky top-0 shrink-0">
        {navContent}
      </aside>

      {isOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/40 dark:bg-black/70 backdrop-blur-xs transition-opacity"
            onClick={onClose}
          />
          <div className="relative z-10 h-full w-[80%] max-w-[280px]">
            {navContent}
          </div>
        </div>
      )}
    </>
  );
}
