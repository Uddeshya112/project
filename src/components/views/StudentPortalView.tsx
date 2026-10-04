import React, { useState, useMemo } from 'react';
import { useTimetable } from '../../context/TimetableContext';
import { useAuth } from '../../context/AuthContext';
import { TIME_SLOTS } from '../../lib/initialData';
import { DayOfWeek, ClassSession, Course } from '../../types';
import {
  Calendar,
  Clock,
  MapPin,
  User,
  BookOpen,
  Users,
  AlertTriangle,
  CheckCircle2,
  ThumbsUp,
  X,
  ChevronRight,
  Printer,
  Vote,
  GraduationCap
} from 'lucide-react';

export function StudentPortalView() {
  const { currentUser } = useAuth();
  const {
    sections,
    sessions,
    courses,
    facultyMembers,
    rooms,
    polls,
    votePoll,
    activeView,
    setActiveView
  } = useTimetable();

  // Student Identity & Section resolution
  const studentName = (currentUser?.name || 'Rohan Sharma').replace(/\s*\(Student\)/i, '').replace(/\s*\(CR\)/i, '');
  const studentRollNo = currentUser?.rollNumber || '102303999';
  const currentSection = sections.find(s => s.id === (currentUser?.sectionId || 'sec-cse-a')) || sections[0];

  // Tab State: sync with activeView or default to overview
  const currentTab = useMemo(() => {
    if (activeView === 'grid') return 'timetable';
    if (activeView === 'student_courses') return 'courses';
    if (activeView === 'student_section') return 'section';
    return 'dashboard';
  }, [activeView]);

  const setTab = (tab: 'dashboard' | 'timetable' | 'courses' | 'section') => {
    if (tab === 'timetable') setActiveView('grid');
    else if (tab === 'courses') setActiveView('student_courses');
    else if (tab === 'section') setActiveView('student_section');
    else setActiveView('overview');
  };

  // Day filter for mobile timetable
  const days: DayOfWeek[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const [selectedMobileDay, setSelectedMobileDay] = useState<DayOfWeek>('Monday');
  const [timetableMode, setTimetableMode] = useState<'grid' | 'agenda'>('grid');

  // Selected session detail modal
  const [selectedSession, setSelectedSession] = useState<ClassSession | null>(null);
  const [selectedCourseDetail, setSelectedCourseDetail] = useState<Course | null>(null);

  // Voting state
  const activePoll = polls[0];
  const [hasVotedLocally, setHasVotedLocally] = useState(false);

  // Section sessions
  const sectionSessions = useMemo(() => {
    return sessions.filter(s => s.sectionId === currentSection.id);
  }, [sessions, currentSection.id]);

  // Today (Monday) sessions
  const mondaySessions = useMemo(() => {
    return sectionSessions.filter(s => s.day === 'Monday');
  }, [sectionSessions]);

  // Next upcoming class for today
  const nextSession = useMemo(() => {
    return mondaySessions.find(s => s.timeSlotId === 'ts-3' && s.status !== 'Cancelled') ||
      mondaySessions.find(s => s.status !== 'Cancelled');
  }, [mondaySessions]);

  const nextCourse = nextSession ? courses.find(c => c.id === nextSession.courseId) : null;
  const nextFaculty = nextSession ? facultyMembers.find(f => f.id === nextSession.facultyId) : null;
  const nextRoom = nextSession ? rooms.find(r => r.id === nextSession.roomId) : null;

  // Enrolled courses for this section
  const enrolledCourses = useMemo(() => {
    const courseIds = Array.from(new Set(sectionSessions.map(s => s.courseId)));
    return courses.filter(c => courseIds.includes(c.id));
  }, [sectionSessions, courses]);

  // Total credits
  const totalCredits = enrolledCourses.reduce((sum, c) => sum + (c.credits || 4), 0);

  // Time greeting helper
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto font-sans">
      
      {/* 1. Academic Header & Sub-Navigation */}
      <div className="border-b border-[#E5E2D9] dark:border-zinc-800 pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold font-serif text-stone-900 dark:text-zinc-100 tracking-tight">
              {getGreeting()}, {studentName.split(' ')[0]}
            </h1>
            <p className="text-xs sm:text-sm text-stone-500 dark:text-zinc-400 mt-1">
              B.Tech Computer Science & Engineering · Semester {currentSection.semester} · {currentSection.name}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs px-2.5 py-1 rounded-md bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 font-mono text-stone-700 dark:text-zinc-300">
              Roll No. {studentRollNo}
            </span>
          </div>
        </div>

        {/* Clean Student Navigation Bar */}
        <div className="flex items-center gap-1 sm:gap-2 mt-5 border-b border-[#E5E2D9] dark:border-zinc-800 -mb-4 overflow-x-auto text-xs font-medium">
          <button
            onClick={() => setTab('dashboard')}
            className={`py-2 px-3 border-b-2 transition-all flex items-center gap-1.5 whitespace-nowrap ${
              currentTab === 'dashboard'
                ? 'border-[#8C1B2E] text-[#8C1B2E] dark:text-red-400 font-semibold'
                : 'border-transparent text-stone-600 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-200'
            }`}
          >
            <Calendar className="h-3.5 w-3.5" />
            <span>Dashboard</span>
          </button>

          <button
            onClick={() => setTab('timetable')}
            className={`py-2 px-3 border-b-2 transition-all flex items-center gap-1.5 whitespace-nowrap ${
              currentTab === 'timetable'
                ? 'border-[#8C1B2E] text-[#8C1B2E] dark:text-red-400 font-semibold'
                : 'border-transparent text-stone-600 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-200'
            }`}
          >
            <Clock className="h-3.5 w-3.5" />
            <span>My Timetable</span>
          </button>

          <button
            onClick={() => setTab('courses')}
            className={`py-2 px-3 border-b-2 transition-all flex items-center gap-1.5 whitespace-nowrap ${
              currentTab === 'courses'
                ? 'border-[#8C1B2E] text-[#8C1B2E] dark:text-red-400 font-semibold'
                : 'border-transparent text-stone-600 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-200'
            }`}
          >
            <BookOpen className="h-3.5 w-3.5" />
            <span>My Courses</span>
          </button>

          <button
            onClick={() => setTab('section')}
            className={`py-2 px-3 border-b-2 transition-all flex items-center gap-1.5 whitespace-nowrap ${
              currentTab === 'section'
                ? 'border-[#8C1B2E] text-[#8C1B2E] dark:text-red-400 font-semibold'
                : 'border-transparent text-stone-600 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-200'
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            <span>My Section</span>
          </button>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 2. TAB 1: DASHBOARD */}
      {/* ============================================================ */}
      {currentTab === 'dashboard' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          
          {/* Top Row: Next Class Section & Today Schedule Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            
            {/* NEXT CLASS COMPACT SECTION */}
            <div className="md:col-span-2 p-5 bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#8C1B2E] dark:text-red-400">
                    Next Class
                  </span>
                  <span className="text-stone-300 dark:text-zinc-600">·</span>
                  <span className="text-xs text-stone-500 dark:text-zinc-400 font-mono">10:00–11:00</span>
                </div>

                <div className="text-base sm:text-lg font-bold text-stone-900 dark:text-zinc-100 font-serif">
                  {nextCourse ? `${nextCourse.code} · ${nextCourse.name}` : 'MA501 · Discrete Mathematics & Graph Theory'}
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-600 dark:text-zinc-400 pt-0.5">
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5 text-stone-400" />
                    <span>{nextRoom ? `${nextRoom.name} · ${nextRoom.building}` : 'Room 204 · Turing Block'}</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <User className="h-3.5 w-3.5 text-stone-400" />
                    <span>{nextFaculty ? nextFaculty.name : 'Prof. Sunita Roy'}</span>
                  </span>
                </div>
              </div>

              <div className="shrink-0">
                <button
                  onClick={() => setTab('timetable')}
                  className="px-3.5 py-1.5 rounded-lg border border-[#E5E2D9] dark:border-zinc-700 bg-white dark:bg-zinc-800 text-stone-800 dark:text-zinc-200 hover:bg-stone-100 dark:hover:bg-zinc-700 text-xs font-medium transition-all shadow-xs flex items-center gap-1"
                >
                  <span>View timetable</span>
                  <ChevronRight className="h-3 w-3" />
                </button>
              </div>
            </div>

            {/* Today Summary Card */}
            <div className="p-5 bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl flex flex-col justify-between">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-stone-500 dark:text-zinc-400 block mb-1">
                  Today's Schedule
                </span>
                <div className="text-base font-bold text-stone-900 dark:text-zinc-100 font-serif">
                  Monday, 04 October
                </div>
                <div className="text-xs text-stone-500 dark:text-zinc-400 mt-1">
                  4 scheduled classes · 1 cancelled
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-[#E5E2D9] dark:border-zinc-800 flex items-center justify-between text-xs">
                <span className="text-stone-500 dark:text-zinc-400">Class Section</span>
                <span className="font-semibold text-stone-800 dark:text-zinc-200">{currentSection.name}</span>
              </div>
            </div>
          </div>

          {/* Academic Alert: Cancelled Class */}
          <div className="p-4 bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-md bg-[#8C1B2E]/10 text-[#8C1B2E] dark:text-red-400 flex items-center justify-center shrink-0 font-bold mt-0.5">
                <AlertTriangle className="h-3.5 w-3.5" />
              </div>
              <div>
                <div className="font-semibold text-stone-900 dark:text-zinc-100">
                  Monday · 08:00–09:00 · CS501 Database Management Systems cancelled
                </div>
                <div className="text-stone-500 dark:text-zinc-400 mt-0.5">
                  Replacement class times are available. Please select the time that works best for your section.
                </div>
              </div>
            </div>

            <div className="shrink-0">
              <a
                href="#replacement-vote-section"
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#8C1B2E] hover:bg-[#721525] text-white font-medium text-xs shadow-xs transition-colors"
              >
                <span>View options</span>
                <ChevronRight className="h-3 w-3" />
              </a>
            </div>
          </div>

          {/* Today's Classes List (Clean Academic Preview) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-stone-900 dark:text-zinc-100 font-serif">
                Today's Classes
              </h2>
              <span className="text-xs text-stone-500 dark:text-zinc-400 font-mono">
                Monday · Room 204
              </span>
            </div>

            <div className="bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl overflow-hidden divide-y divide-[#E5E2D9] dark:divide-zinc-800 text-xs">
              {TIME_SLOTS.slice(0, 7).map(slot => {
                const isLunch = slot.id === 'ts-5';
                const session = mondaySessions.find(s => s.timeSlotId === slot.id);
                const course = session ? courses.find(c => c.id === session.courseId) : null;
                const faculty = session ? facultyMembers.find(f => f.id === session.facultyId) : null;
                const room = session ? rooms.find(r => r.id === session.roomId) : null;
                const isNow = slot.id === 'ts-3';

                if (isLunch) {
                  return (
                    <div key={slot.id} className="p-3 bg-[#F4F2EC] dark:bg-zinc-950/40 flex items-center justify-between text-stone-500 dark:text-zinc-400">
                      <div className="flex items-center gap-2 w-32 shrink-0 font-mono text-[11px]">
                        <span>{slot.startTime}–{slot.endTime}</span>
                      </div>
                      <span className="font-medium text-stone-700 dark:text-zinc-300">Lunch Break</span>
                      <span className="text-[11px] text-stone-400">No classes</span>
                    </div>
                  );
                }

                return (
                  <div
                    key={slot.id}
                    onClick={() => session && setSelectedSession(session)}
                    className={`p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                      session ? 'cursor-pointer hover:bg-white dark:hover:bg-zinc-800/60' : ''
                    } ${
                      session?.status === 'Cancelled'
                        ? 'bg-rose-50/30 dark:bg-rose-950/10'
                        : isNow
                        ? 'bg-[#8C1B2E]/5 dark:bg-red-950/20'
                        : ''
                    }`}
                  >
                    <div className="flex items-center gap-2 text-stone-500 dark:text-zinc-400 w-32 shrink-0 font-mono text-[11px]">
                      <span>{slot.startTime}–{slot.endTime}</span>
                      {isNow && (
                        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-[#8C1B2E] text-white">
                          Now
                        </span>
                      )}
                    </div>

                    <div className="flex-1">
                      {session && course ? (
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2 font-medium text-stone-900 dark:text-zinc-100">
                              <span className="font-mono font-semibold text-[#8C1B2E] dark:text-red-400">{course.code}</span>
                              <span className="text-stone-300">·</span>
                              <span>{course.name}</span>
                              {session.status === 'Cancelled' && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-900 font-medium">
                                  Cancelled
                                </span>
                              )}
                              {session.type === 'Lab' && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-900 font-medium">
                                  Lab
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-stone-500 dark:text-zinc-400 mt-0.5 flex items-center gap-3">
                              <span>{faculty?.name || 'Assigned Faculty'}</span>
                              <span>·</span>
                              <span>{room?.name || 'Room 204'}</span>
                            </div>
                          </div>

                          <span className="text-[11px] text-stone-400 dark:text-zinc-500 hidden sm:inline">
                            Details →
                          </span>
                        </div>
                      ) : (
                        <span className="text-stone-400 dark:text-zinc-500 italic">Free period</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Replacement Time Voting Component */}
          <div id="replacement-vote-section" className="space-y-3 pt-2">
            <div>
              <h2 className="text-base font-bold text-stone-900 dark:text-zinc-100 font-serif">
                Choose a replacement class time
              </h2>
              <p className="text-xs text-stone-500 dark:text-zinc-400 mt-0.5">
                Select the time that works best for your section.
              </p>
            </div>

            {activePoll && (
              <div className="bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl p-5 space-y-4 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#E5E2D9] dark:border-zinc-800">
                  <div className="font-semibold text-stone-900 dark:text-zinc-100">
                    CS501 · Database Management Systems (Replacement for Monday 08:00)
                  </div>
                  <div className="text-stone-500 dark:text-zinc-400 text-[11px]">
                    {activePoll.votedStudentsCount} responses recorded
                  </div>
                </div>

                <div className="space-y-3">
                  {activePoll.options.map(opt => {
                    const totalVotes = activePoll.options.reduce((sum, o) => sum + o.votes, 0) || 1;
                    const percentage = Math.round((opt.votes / totalVotes) * 100);
                    const isSelected = activePoll.userVotedOptionId === opt.id || hasVotedLocally;

                    return (
                      <div
                        key={opt.id}
                        className={`p-4 rounded-xl border transition-all ${
                          isSelected
                            ? 'bg-white dark:bg-zinc-950 border-[#8C1B2E]/40 dark:border-red-900/60 shadow-xs'
                            : 'bg-white dark:bg-zinc-900/80 border-[#E5E2D9] dark:border-zinc-800'
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="space-y-1">
                            <div className="font-bold text-stone-900 dark:text-zinc-100 text-sm">
                              {opt.timeSlotLabel}
                            </div>
                            <div className="text-xs text-stone-500 dark:text-zinc-400">
                              {percentage}% of students selected this option
                            </div>
                          </div>

                          <div className="shrink-0">
                            <button
                              onClick={() => {
                                votePoll(activePoll.id, opt.id);
                                setHasVotedLocally(true);
                              }}
                              disabled={activePoll.userHasVoted || hasVotedLocally}
                              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                isSelected
                                  ? 'bg-[#8C1B2E] text-white cursor-default'
                                  : 'bg-white dark:bg-zinc-800 border border-[#E5E2D9] dark:border-zinc-700 hover:bg-[#8C1B2E] hover:text-white text-stone-800 dark:text-zinc-200'
                              }`}
                            >
                              {isSelected ? 'Selected' : 'Select this time'}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {(activePoll.userHasVoted || hasVotedLocally) && (
                  <div className="p-3 rounded-lg bg-[#F4F2EC] dark:bg-zinc-950 border border-[#E5E2D9] dark:border-zinc-800 text-stone-700 dark:text-zinc-300 text-xs flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-[#8C1B2E] shrink-0" />
                    <span>Your choice has been recorded.</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 3. TAB 2: MY TIMETABLE (TRUE WEEKLY MATRIX GRID) */}
      {/* ============================================================ */}
      {currentTab === 'timetable' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          
          {/* Timetable Header & Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold font-serif text-stone-900 dark:text-zinc-100 tracking-tight">
                Weekly Academic Schedule
              </h2>
              <p className="text-xs text-stone-500 dark:text-zinc-400 mt-0.5">
                Semester 5 · Section {currentSection.name} · Room 204
              </p>
            </div>

            <div className="flex items-center gap-2">
              {/* Desktop / Mobile mode switch */}
              <div className="flex bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 p-0.5 rounded-lg text-xs font-medium">
                <button
                  onClick={() => setTimetableMode('grid')}
                  className={`px-3 py-1 rounded-md transition-colors ${
                    timetableMode === 'grid'
                      ? 'bg-white dark:bg-zinc-800 text-stone-900 dark:text-zinc-100 font-semibold shadow-xs'
                      : 'text-stone-600 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-200'
                  }`}
                >
                  Weekly Grid
                </button>
                <button
                  onClick={() => setTimetableMode('agenda')}
                  className={`px-3 py-1 rounded-md transition-colors ${
                    timetableMode === 'agenda'
                      ? 'bg-white dark:bg-zinc-800 text-stone-900 dark:text-zinc-100 font-semibold shadow-xs'
                      : 'text-stone-600 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-200'
                  }`}
                >
                  Day View
                </button>
              </div>

              {/* Print Action */}
              <button
                onClick={handlePrint}
                className="px-3 py-1.5 rounded-lg border border-[#E5E2D9] dark:border-zinc-800 bg-[#FAF9F5] dark:bg-zinc-900 hover:bg-stone-100 dark:hover:bg-zinc-800 text-stone-700 dark:text-zinc-300 text-xs font-medium transition-colors flex items-center gap-1.5"
                title="Print Timetable"
              >
                <Printer className="h-3.5 w-3.5 text-stone-500" />
                <span>Print</span>
              </button>
            </div>
          </div>

          {/* DESKTOP TIMETABLE GRID (TRUE MATRIX) */}
          {timetableMode === 'grid' && (
            <div className="bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs min-w-[780px]">
                  <thead>
                    <tr className="bg-[#F4F2EC] dark:bg-zinc-950/70 border-b border-[#E5E2D9] dark:border-zinc-800 text-stone-800 dark:text-zinc-300">
                      <th className="p-3 font-semibold w-24 text-stone-500 dark:text-zinc-400 border-r border-[#E5E2D9] dark:border-zinc-800 font-mono text-[11px]">
                        Time Slot
                      </th>
                      {days.map(d => (
                        <th
                          key={d}
                          className={`p-3 font-semibold text-center border-r border-[#E5E2D9] dark:border-zinc-800 last:border-r-0 ${
                            d === 'Monday'
                              ? 'bg-[#8C1B2E]/5 dark:bg-red-950/20 text-[#8C1B2E] dark:text-red-300'
                              : ''
                          }`}
                        >
                          <div className="uppercase tracking-wider text-[11px] font-bold">{d}</div>
                          <div className="text-[10px] text-stone-400 dark:text-zinc-500 font-normal">
                            {d === 'Monday' ? 'Today' : ''}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5E2D9] dark:divide-zinc-800">
                    {TIME_SLOTS.map(slot => {
                      const isLunch = slot.id === 'ts-5';

                      if (isLunch) {
                        return (
                          <tr key={slot.id} className="bg-[#F4F2EC] dark:bg-zinc-950/60">
                            <td className="p-2.5 font-mono text-[11px] text-stone-500 dark:text-zinc-400 border-r border-[#E5E2D9] dark:border-zinc-800 whitespace-nowrap">
                              {slot.startTime}–{slot.endTime}
                            </td>
                            <td colSpan={5} className="p-2.5 text-center text-xs font-medium text-stone-500 dark:text-zinc-400 tracking-wide">
                              Lunch Break
                            </td>
                          </tr>
                        );
                      }

                      return (
                        <tr key={slot.id} className="hover:bg-white/40 dark:hover:bg-zinc-800/20 transition-colors">
                          {/* Time Column */}
                          <td className="p-2.5 font-mono text-[11px] text-stone-500 dark:text-zinc-400 border-r border-[#E5E2D9] dark:border-zinc-800 whitespace-nowrap align-top">
                            {slot.startTime}–{slot.endTime}
                          </td>

                          {/* Days Mon-Fri */}
                          {days.map(d => {
                            const session = sectionSessions.find(
                              s => s.day === d && s.timeSlotId === slot.id
                            );
                            const course = session ? courses.find(c => c.id === session.courseId) : null;
                            const faculty = session ? facultyMembers.find(f => f.id === session.facultyId) : null;
                            const room = session ? rooms.find(r => r.id === session.roomId) : null;
                            const isNow = d === 'Monday' && slot.id === 'ts-3';

                            return (
                              <td
                                key={d}
                                className={`p-1.5 border-r border-[#E5E2D9] dark:border-zinc-800 last:border-r-0 align-top ${
                                  d === 'Monday' ? 'bg-[#8C1B2E]/3 dark:bg-red-950/10' : ''
                                }`}
                              >
                                {session && course ? (
                                  <div
                                    onClick={() => setSelectedSession(session)}
                                    className={`p-2.5 rounded-lg border text-left cursor-pointer transition-all hover:-translate-y-0.5 ${
                                      session.status === 'Cancelled'
                                        ? 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/50'
                                        : session.type === 'Lab'
                                        ? 'bg-blue-50/40 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900/40'
                                        : isNow
                                        ? 'bg-white dark:bg-zinc-800 border-[#8C1B2E] shadow-xs'
                                        : 'bg-white dark:bg-zinc-800/80 border-[#E5E2D9] dark:border-zinc-700/80 hover:border-stone-400'
                                    }`}
                                  >
                                    <div className="flex items-center justify-between gap-1 mb-1">
                                      <span className="font-mono font-bold text-[#8C1B2E] dark:text-red-400 text-xs">
                                        {course.code}
                                      </span>
                                      {isNow && (
                                        <span className="text-[9px] font-bold px-1 rounded bg-[#8C1B2E] text-white">
                                          Now
                                        </span>
                                      )}
                                      {session.status === 'Cancelled' && (
                                        <span className="text-[9px] font-medium text-rose-700 dark:text-rose-400">
                                          Cancelled
                                        </span>
                                      )}
                                      {session.type === 'Lab' && (
                                        <span className="text-[9px] font-medium text-blue-700 dark:text-blue-400">
                                          Lab
                                        </span>
                                      )}
                                    </div>

                                    <div className="text-xs font-semibold text-stone-900 dark:text-zinc-100 line-clamp-1">
                                      {course.name}
                                    </div>

                                    <div className="text-[11px] text-stone-500 dark:text-zinc-400 mt-1 flex items-center justify-between">
                                      <span className="truncate">{faculty?.name.split(' ').pop()}</span>
                                      <span className="font-mono">{room?.name || '204'}</span>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="h-full min-h-[56px] rounded flex items-center justify-center text-[10px] text-stone-300 dark:text-zinc-700">
                                    —
                                  </div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* DAY VIEW / MOBILE AGENDA MODE */}
          {timetableMode === 'agenda' && (
            <div className="space-y-4">
              {/* Day selector pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                {days.map(d => (
                  <button
                    key={d}
                    onClick={() => setSelectedMobileDay(d)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 ${
                      selectedMobileDay === d
                        ? 'bg-[#8C1B2E] text-white shadow-xs'
                        : 'bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 text-stone-700 dark:text-zinc-300 hover:bg-stone-100 dark:hover:bg-zinc-800'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>

              {/* Day Agenda Cards */}
              <div className="bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl overflow-hidden divide-y divide-[#E5E2D9] dark:divide-zinc-800 text-xs">
                {TIME_SLOTS.map(slot => {
                  const isLunch = slot.id === 'ts-5';
                  const session = sectionSessions.find(
                    s => s.day === selectedMobileDay && s.timeSlotId === slot.id
                  );
                  const course = session ? courses.find(c => c.id === session.courseId) : null;
                  const faculty = session ? facultyMembers.find(f => f.id === session.facultyId) : null;
                  const room = session ? rooms.find(r => r.id === session.roomId) : null;

                  if (isLunch) {
                    return (
                      <div key={slot.id} className="p-3 bg-[#F4F2EC] dark:bg-zinc-950 flex items-center justify-between text-stone-500">
                        <span className="font-mono text-[11px]">{slot.startTime}–{slot.endTime}</span>
                        <span className="font-medium">Lunch Break</span>
                        <span>—</span>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={slot.id}
                      onClick={() => session && setSelectedSession(session)}
                      className={`p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                        session ? 'cursor-pointer hover:bg-white dark:hover:bg-zinc-800/60' : ''
                      }`}
                    >
                      <div className="font-mono text-stone-500 dark:text-zinc-400 w-28 shrink-0 text-[11px]">
                        {slot.startTime}–{slot.endTime}
                      </div>

                      <div className="flex-1">
                        {session && course ? (
                          <div>
                            <div className="font-medium text-stone-900 dark:text-zinc-100 flex items-center gap-2">
                              <span className="font-mono font-bold text-[#8C1B2E]">{course.code}</span>
                              <span>·</span>
                              <span>{course.name}</span>
                              {session.status === 'Cancelled' && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 font-medium">
                                  Cancelled
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-stone-500 dark:text-zinc-400 mt-0.5">
                              {faculty?.name} · {room?.name || 'Room 204'}
                            </div>
                          </div>
                        ) : (
                          <span className="text-stone-400 dark:text-zinc-600 italic">Free period</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* 4. TAB 3: MY COURSES */}
      {/* ============================================================ */}
      {currentTab === 'courses' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold font-serif text-stone-900 dark:text-zinc-100 tracking-tight">
                My Courses
              </h2>
              <p className="text-xs text-stone-500 dark:text-zinc-400 mt-0.5">
                Semester 5 · Section {currentSection.name} · {enrolledCourses.length} Registered Courses ({totalCredits} Credits)
              </p>
            </div>

            <div className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 text-stone-700 dark:text-zinc-300">
              Total Enrolled Credits: {totalCredits}
            </div>
          </div>

          {/* Courses List / Table */}
          <div className="bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl overflow-hidden divide-y divide-[#E5E2D9] dark:divide-zinc-800 text-xs">
            {enrolledCourses.map(course => {
              const primaryFac = facultyMembers.find(f => f.id === course.primaryFacultyId);

              return (
                <div key={course.id} className="p-4 hover:bg-white/60 dark:hover:bg-zinc-800/30 transition-colors">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-[#8C1B2E] dark:text-red-400 font-mono">
                          {course.code}
                        </span>
                        <span className="text-stone-300">·</span>
                        <h3 className="font-bold text-sm text-stone-900 dark:text-zinc-100">
                          {course.name}
                        </h3>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-white dark:bg-zinc-800 text-stone-600 dark:text-zinc-400 border border-[#E5E2D9] dark:border-zinc-700">
                          {course.credits} Credits
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-stone-500 dark:text-zinc-400 text-xs">
                        <span className="flex items-center gap-1">
                          <User className="h-3.5 w-3.5 text-stone-400" />
                          <span>Faculty: {primaryFac?.name || 'Department Faculty'}</span>
                        </span>
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5 text-stone-400" />
                          <span>Room: {course.requiresLab ? 'Room 204 & Lab 301' : 'Room 204'}</span>
                        </span>
                        <span>
                          Type: {course.requiresLab ? 'Lecture + Lab' : 'Lecture'}
                        </span>
                      </div>
                    </div>

                    <div className="shrink-0">
                      <button
                        onClick={() => setSelectedCourseDetail(course)}
                        className="px-3 py-1.5 rounded-lg border border-[#E5E2D9] dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-stone-100 dark:hover:bg-zinc-700 text-stone-800 dark:text-zinc-200 font-medium text-xs transition-colors"
                      >
                        View course details
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 5. TAB 4: MY SECTION (CSE-A) */}
      {/* ============================================================ */}
      {currentTab === 'section' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          
          <div>
            <h2 className="text-xl sm:text-2xl font-bold font-serif text-stone-900 dark:text-zinc-100 tracking-tight">
              Section {currentSection.name}
            </h2>
            <p className="text-xs text-stone-500 dark:text-zinc-400 mt-0.5">
              B.Tech Computer Science & Engineering · Semester {currentSection.semester} · Batch 2024
            </p>
          </div>

          {/* Section Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div className="p-4 rounded-xl bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800">
              <span className="text-[11px] text-stone-500 dark:text-zinc-400 block mb-0.5">Enrolled Students</span>
              <span className="text-base font-bold text-stone-900 dark:text-zinc-100 font-serif">
                {currentSection.studentCount} Students
              </span>
            </div>

            <div className="p-4 rounded-xl bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800">
              <span className="text-[11px] text-stone-500 dark:text-zinc-400 block mb-0.5">Home Classroom</span>
              <span className="text-base font-bold text-stone-900 dark:text-zinc-100 font-serif">
                Room 204
              </span>
            </div>

            <div className="p-4 rounded-xl bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800">
              <span className="text-[11px] text-stone-500 dark:text-zinc-400 block mb-0.5">Class Representative</span>
              <span className="text-xs font-semibold text-stone-900 dark:text-zinc-100 truncate block">
                {currentSection.classRepresentative?.name || 'Aarav Mehta'}
              </span>
            </div>

            <div className="p-4 rounded-xl bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800">
              <span className="text-[11px] text-stone-500 dark:text-zinc-400 block mb-0.5">Faculty Mentor</span>
              <span className="text-xs font-semibold text-stone-900 dark:text-zinc-100 truncate block">
                Prof. Arvind Sharma
              </span>
            </div>
          </div>

          {/* Sub-sections / Lab Batches */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-stone-900 dark:text-zinc-100 font-serif">
              Laboratory Batches
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-4 rounded-xl bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800">
                <div className="flex items-center justify-between font-semibold text-stone-900 dark:text-zinc-100 mb-1">
                  <span>Batch A1 (Roll No 102303001–102303026)</span>
                  <span className="text-[#8C1B2E] dark:text-red-400 text-[11px] font-bold">Your Batch</span>
                </div>
                <p className="text-stone-500 dark:text-zinc-400 text-[11px]">
                  26 Students · Practical sessions in Computer Lab 301 (Turing Block)
                </p>
              </div>

              <div className="p-4 rounded-xl bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800">
                <div className="font-semibold text-stone-900 dark:text-zinc-100 mb-1">
                  Batch A2 (Roll No 102303027–102303052)
                </div>
                <p className="text-stone-500 dark:text-zinc-400 text-[11px]">
                  26 Students · Practical sessions in Computer Lab 302 (Turing Block)
                </p>
              </div>
            </div>
          </div>

          {/* Section Notices */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-stone-900 dark:text-zinc-100 font-serif">
              Section Announcements
            </h3>
            <div className="bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl divide-y divide-[#E5E2D9] dark:divide-zinc-800 text-xs">
              <div className="p-4 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-stone-900 dark:text-zinc-100">
                    DBMS Lab Practical Assignment Submission
                  </span>
                  <span className="text-[10px] text-stone-400">Yesterday</span>
                </div>
                <p className="text-stone-600 dark:text-zinc-400 leading-relaxed">
                  Batch A1 practical scheduled for Thursday 13:00 will take place in Turing Lab 301. Bring your completed Lab 3 queries.
                </p>
              </div>

              <div className="p-4 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-stone-900 dark:text-zinc-100">
                    Rescheduled DBMS Lecture Consensus Vote
                  </span>
                  <span className="text-[10px] text-stone-400">2 days ago</span>
                </div>
                <p className="text-stone-600 dark:text-zinc-400 leading-relaxed">
                  Voting for Monday's cancelled DBMS class is currently live on your student dashboard. Please submit your preferred time.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 6. MODAL: CLASS SESSION DETAILS DIALOG */}
      {/* ============================================================ */}
      {selectedSession && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl max-w-md w-full p-6 shadow-xl space-y-4 text-stone-900 dark:text-zinc-100">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[11px] font-mono font-bold text-[#8C1B2E] dark:text-red-400">
                  {courses.find(c => c.id === selectedSession.courseId)?.code}
                </span>
                <h3 className="text-base font-bold font-serif mt-0.5">
                  {courses.find(c => c.id === selectedSession.courseId)?.name}
                </h3>
              </div>
              <button
                onClick={() => setSelectedSession(null)}
                className="p-1 rounded text-stone-400 hover:text-stone-700 dark:hover:text-zinc-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs bg-white dark:bg-zinc-950 p-4 rounded-lg border border-[#E5E2D9] dark:border-zinc-800 divide-y divide-[#E5E2D9] dark:divide-zinc-800/60">
              <div className="flex justify-between py-1.5 first:pt-0">
                <span className="text-stone-500 dark:text-zinc-400">Instructor:</span>
                <span className="font-semibold text-stone-800 dark:text-zinc-200">{facultyMembers.find(f => f.id === selectedSession.facultyId)?.name}</span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-stone-500 dark:text-zinc-400">Room:</span>
                <span className="font-semibold text-stone-800 dark:text-zinc-200">{rooms.find(r => r.id === selectedSession.roomId)?.name} ({rooms.find(r => r.id === selectedSession.roomId)?.building})</span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-stone-500 dark:text-zinc-400">Scheduled Time:</span>
                <span className="font-semibold text-stone-800 dark:text-zinc-200">{selectedSession.day} · {TIME_SLOTS.find(t => t.id === selectedSession.timeSlotId)?.startTime}–{TIME_SLOTS.find(t => t.id === selectedSession.timeSlotId)?.endTime}</span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-stone-500 dark:text-zinc-400">Section:</span>
                <span className="font-semibold text-stone-800 dark:text-zinc-200">{currentSection.name}</span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-stone-500 dark:text-zinc-400">Session Type:</span>
                <span className="font-semibold text-stone-800 dark:text-zinc-200">{selectedSession.type}</span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-stone-500 dark:text-zinc-400">Status:</span>
                <span className={`font-semibold ${selectedSession.status === 'Cancelled' ? 'text-rose-700' : 'text-emerald-700'}`}>
                  {selectedSession.status}
                </span>
              </div>

              {selectedSession.status === 'Cancelled' && (
                <div className="pt-2 text-rose-700 dark:text-rose-400 text-[11px] leading-relaxed">
                  Reason: {selectedSession.cancellationReason || 'Faculty unavailable for scheduled session.'}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setSelectedSession(null)}
                className="px-4 py-1.5 rounded-lg border border-[#E5E2D9] dark:border-zinc-700 bg-white dark:bg-zinc-800 text-stone-700 dark:text-zinc-200 font-medium text-xs shadow-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 7. MODAL: COURSE DETAIL DIALOG */}
      {/* ============================================================ */}
      {selectedCourseDetail && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl max-w-lg w-full p-6 shadow-xl space-y-4 text-stone-900 dark:text-zinc-100">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[11px] font-mono font-bold text-[#8C1B2E] dark:text-red-400">
                  {selectedCourseDetail.code}
                </span>
                <h3 className="text-base font-bold font-serif mt-0.5">
                  {selectedCourseDetail.name}
                </h3>
              </div>
              <button
                onClick={() => setSelectedCourseDetail(null)}
                className="p-1 rounded text-stone-400 hover:text-stone-700 dark:hover:text-zinc-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-stone-600 dark:text-zinc-300">
              <div className="grid grid-cols-2 gap-2 p-3 bg-white dark:bg-zinc-950 rounded-lg border border-[#E5E2D9] dark:border-zinc-800">
                <div>
                  <span className="text-[10px] text-stone-400 block">Credits</span>
                  <span className="font-bold text-stone-900 dark:text-zinc-100">{selectedCourseDetail.credits} Credits</span>
                </div>
                <div>
                  <span className="text-[10px] text-stone-400 block">Department</span>
                  <span className="font-bold text-stone-900 dark:text-zinc-100">CSED</span>
                </div>
                <div>
                  <span className="text-[10px] text-stone-400 block">Weekly Lectures</span>
                  <span className="font-bold text-stone-900 dark:text-zinc-100">{selectedCourseDetail.requiredLecturesPerWeek || 3} Hours</span>
                </div>
                <div>
                  <span className="text-[10px] text-stone-400 block">Weekly Labs</span>
                  <span className="font-bold text-stone-900 dark:text-zinc-100">{selectedCourseDetail.requiredLabsPerWeek || 0} Hours</span>
                </div>
              </div>

              <div className="p-3 bg-white dark:bg-zinc-950 rounded-lg border border-[#E5E2D9] dark:border-zinc-800 space-y-1">
                <span className="text-[11px] font-semibold text-stone-900 dark:text-zinc-100 block">Course Syllabus Coverage</span>
                <p className="text-[11px] text-stone-500 dark:text-zinc-400 leading-relaxed">
                  Relational Algebra, SQL DDL/DML, Normalization (1NF to BCNF), Transaction Processing (ACID), Concurrency Control, and Indexing with B+ Trees.
                </p>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setSelectedCourseDetail(null)}
                className="px-4 py-1.5 rounded-lg border border-[#E5E2D9] dark:border-zinc-700 bg-white dark:bg-zinc-800 text-stone-700 dark:text-zinc-200 font-medium text-xs shadow-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
