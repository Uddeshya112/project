import React from 'react';
import { useTimetable } from '../../context/TimetableContext';
import { useAuth } from '../../context/AuthContext';
import { ChevronRight, Calendar, AlertTriangle, CheckCircle2, Clock, MapPin, User, ArrowRight } from 'lucide-react';

export function CoordinatorView() {
  const {
    academicYear,
    courses,
    facultyMembers,
    rooms,
    sections,
    sessions,
    allocations,
    publishStatus,
    validationReport,
    auditLogs,
    setActiveView,
  } = useTimetable();

  const { currentUser } = useAuth();

  // Data calculations
  const activeFaculty = facultyMembers.filter(f => f.status !== 'Inactive');
  const activeCourses = courses.filter(c => c.status !== 'Archived');
  const activeRooms = rooms.filter(r => r.isAvailable);

  const allocatedCourseIds = new Set(allocations.map(a => a.courseId));
  const allocationsPendingCount = Math.max(0, activeCourses.length - allocatedCourseIds.size);

  const facultyWithPrefsCount = activeFaculty.filter(f => f.preferences && f.preferences.protectedSlots && f.preferences.protectedSlots.length > 0).length;
  const facultyPendingCount = activeFaculty.length - facultyWithPrefsCount;

  const roomsMissingCapacity = activeRooms.filter(r => !r.capacity || r.capacity <= 0).length;

  // Filter today's sessions (e.g. Monday/Tuesday)
  const todaySessions = sessions.filter(s => s.day === 'Monday' || s.day === 'Tuesday').slice(0, 6);

  const isOddSem = academicYear.semesterNumber % 2 !== 0;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="border-b border-[#E5E2D9] dark:border-zinc-800 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold font-serif text-stone-900 dark:text-zinc-100 tracking-tight">
            Timetable Operations Hub
          </h1>
          <p className="text-xs sm:text-sm text-stone-500 dark:text-zinc-400 mt-1">
            Academic Year {academicYear.yearLabel} · Semester {academicYear.semesterNumber} ({isOddSem ? 'Odd' : 'Even'}) · Centralized Coordinator Workspace
          </p>
        </div>
      </div>

      {/* Main Two-Column Professional Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2/3 width on desktop): Today's Master Schedule + Quick Access */}
        <div className="lg:col-span-2 space-y-6">
          {/* Current Master Timetable Lead Banner */}
          <div className="bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl p-5 space-y-4 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E5E2D9] dark:border-zinc-800 pb-4">
              <div>
                <div className="text-[11px] font-bold text-stone-500 dark:text-zinc-400 uppercase tracking-wider">
                  Master Schedule Status
                </div>
                <div className="text-base font-bold text-stone-900 dark:text-zinc-100 font-serif mt-0.5">
                  Academic Year {academicYear.yearLabel} · {isOddSem ? 'Odd' : 'Even'} Semester
                </div>
                <div className="text-xs text-stone-500 dark:text-zinc-400 mt-1 flex items-center gap-2">
                  <span>Status: <strong className="text-emerald-700 dark:text-emerald-400 font-semibold">{publishStatus}</strong></span>
                  <span>·</span>
                  <span>Active routine: 5 Weekdays</span>
                </div>
              </div>

              <button
                onClick={() => setActiveView('grid')}
                className="px-3.5 py-2 bg-[#8C1B2E] hover:bg-[#721525] text-white font-medium text-xs rounded-lg transition-colors flex items-center gap-1.5 shadow-xs shrink-0"
              >
                <span>Open Timetable Grid</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Today's Schedule Preview Grid */}
            <div className="space-y-3 pt-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold font-serif text-stone-900 dark:text-zinc-100 flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-[#8C1B2E] dark:text-red-400" />
                  <span>Today's Active Classes</span>
                </span>
                <span className="text-[11px] text-stone-500 dark:text-zinc-400">{todaySessions.length} active sessions</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                {todaySessions.map(session => {
                  const course = courses.find(c => c.id === session.courseId);
                  const faculty = facultyMembers.find(f => f.id === session.facultyId);
                  const room = rooms.find(r => r.id === session.roomId);
                  const section = sections.find(s => s.id === session.sectionId);

                  return (
                    <div
                      key={session.id}
                      onClick={() => setActiveView('grid')}
                      className="p-3 bg-white dark:bg-zinc-800/80 border border-[#E5E2D9] dark:border-zinc-700/80 rounded-lg hover:border-stone-400 cursor-pointer transition-colors space-y-1.5 shadow-2xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-[#8C1B2E] dark:text-red-400">{course?.code || session.courseId}</span>
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-[#FAF9F5] dark:bg-zinc-900 text-stone-700 dark:text-zinc-300 border border-[#E5E2D9] dark:border-zinc-700">
                          {section?.name || 'Section'}
                        </span>
                      </div>
                      <div className="text-xs font-medium text-stone-900 dark:text-zinc-100 truncate">
                        {course?.name || 'Academic Course'}
                      </div>
                      <div className="text-[11px] text-stone-500 dark:text-zinc-400 flex items-center gap-3 pt-0.5">
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3 text-stone-400" /> {session.day.slice(0,3)}</span>
                        <span className="flex items-center gap-1"><MapPin className="h-3 w-3 text-stone-400" /> {room?.name || 'Room'}</span>
                        <span className="flex items-center gap-1"><User className="h-3 w-3 text-stone-400" /> {faculty?.name?.split(' ')[1] || 'Faculty'}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Quick Access Section */}
          <div className="space-y-3">
            <h2 className="text-sm font-bold font-serif text-stone-900 dark:text-zinc-100">
              Management Modules
            </h2>

            <div className="bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl divide-y divide-[#E5E2D9] dark:divide-zinc-800 text-xs shadow-xs">
              <div
                onClick={() => setActiveView('academic_setup')}
                className="p-3.5 hover:bg-white dark:hover:bg-zinc-800/60 cursor-pointer transition-colors flex items-center justify-between group"
              >
                <div>
                  <div className="font-semibold text-stone-900 dark:text-zinc-100 group-hover:text-[#8C1B2E] dark:group-hover:text-red-400 transition-colors">
                    Academic Structure & Setup
                  </div>
                  <div className="text-[11px] text-stone-500 dark:text-zinc-400 mt-0.5">
                    Manage departments, programs, courses, faculty roster, rooms, and sections
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-stone-400 group-hover:text-stone-700 dark:group-hover:text-zinc-200 shrink-0 ml-2" />
              </div>

              <div
                onClick={() => setActiveView('allocations')}
                className="p-3.5 hover:bg-white dark:hover:bg-zinc-800/60 cursor-pointer transition-colors flex items-center justify-between group"
              >
                <div>
                  <div className="font-semibold text-stone-900 dark:text-zinc-100 group-hover:text-[#8C1B2E] dark:group-hover:text-red-400 transition-colors">
                    Course Allocations
                  </div>
                  <div className="text-[11px] text-stone-500 dark:text-zinc-400 mt-0.5">
                    Assign courses to faculty instructors and student sections
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-stone-400 group-hover:text-stone-700 dark:group-hover:text-zinc-200 shrink-0 ml-2" />
              </div>

              <div
                onClick={() => setActiveView('availability')}
                className="p-3.5 hover:bg-white dark:hover:bg-zinc-800/60 cursor-pointer transition-colors flex items-center justify-between group"
              >
                <div>
                  <div className="font-semibold text-stone-900 dark:text-zinc-100 group-hover:text-[#8C1B2E] dark:group-hover:text-red-400 transition-colors">
                    Faculty Protected Time
                  </div>
                  <div className="text-[11px] text-stone-500 dark:text-zinc-400 mt-0.5">
                    Configure research, advisory, and department meeting time slots
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-stone-400 group-hover:text-stone-700 dark:group-hover:text-zinc-200 shrink-0 ml-2" />
              </div>

              <div
                onClick={() => setActiveView('generation_validator')}
                className="p-3.5 hover:bg-white dark:hover:bg-zinc-800/60 cursor-pointer transition-colors flex items-center justify-between group"
              >
                <div>
                  <div className="font-semibold text-stone-900 dark:text-zinc-100 group-hover:text-[#8C1B2E] dark:group-hover:text-red-400 transition-colors">
                    Generate Draft Timetable
                  </div>
                  <div className="text-[11px] text-stone-500 dark:text-zinc-400 mt-0.5">
                    Execute schedule solver on active academic configuration
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-stone-400 group-hover:text-stone-700 dark:group-hover:text-zinc-200 shrink-0 ml-2" />
              </div>
            </div>
          </div>
        </div>

        {/* Right Column (1/3 width on desktop): Action Required & Checklist */}
        <div className="space-y-6">
          <div className="space-y-3">
            <h2 className="text-sm font-bold font-serif text-stone-900 dark:text-zinc-100 flex items-center justify-between">
              <span>Readiness Checklist</span>
              <span className="text-[11px] text-stone-500 dark:text-zinc-400 font-sans font-normal">Active review</span>
            </h2>

            <div className="bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl divide-y divide-[#E5E2D9] dark:divide-zinc-800 text-xs shadow-xs">
              {/* Conflict Alert */}
              <div
                onClick={() => setActiveView('generation_validator')}
                className="p-3.5 flex items-center justify-between hover:bg-white dark:hover:bg-zinc-800/60 cursor-pointer transition-colors"
              >
                <div>
                  <div className="font-semibold text-stone-900 dark:text-zinc-100 flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                    <span>Room Capacity Check</span>
                  </div>
                  <div className="text-[11px] text-stone-500 dark:text-zinc-400 mt-0.5">
                    Section CSE-A (52 students) · Room 204 (60 cap)
                  </div>
                </div>
                <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900">
                  Verified
                </span>
              </div>

              {/* Course allocations */}
              <div
                onClick={() => setActiveView('allocations')}
                className="p-3.5 flex items-center justify-between hover:bg-white dark:hover:bg-zinc-800/60 cursor-pointer transition-colors"
              >
                <div>
                  <div className="font-semibold text-stone-900 dark:text-zinc-100">Course Allocations</div>
                  <div className="text-[11px] text-stone-500 dark:text-zinc-400 mt-0.5">
                    5/5 courses allocated across 8 session assignments
                  </div>
                </div>
                <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Complete
                </span>
              </div>

              {/* Faculty availability */}
              <div
                onClick={() => setActiveView('availability')}
                className="p-3.5 flex items-center justify-between hover:bg-white dark:hover:bg-zinc-800/60 cursor-pointer transition-colors"
              >
                <div>
                  <div className="font-semibold text-stone-900 dark:text-zinc-100">Faculty Time Blocks</div>
                  <div className="text-[11px] text-stone-500 dark:text-zinc-400 mt-0.5">
                    Research and advisory time preferences set
                  </div>
                </div>
                <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Complete
                </span>
              </div>

              {/* Rooms & labs */}
              <div
                onClick={() => setActiveView('rooms_mgmt')}
                className="p-3.5 flex items-center justify-between hover:bg-white dark:hover:bg-zinc-800/60 cursor-pointer transition-colors"
              >
                <div>
                  <div className="font-semibold text-stone-900 dark:text-zinc-100">Facilities Setup</div>
                  <div className="text-[11px] text-stone-500 dark:text-zinc-400 mt-0.5">
                    7 lecture halls, labs & classrooms configured
                  </div>
                </div>
                <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Complete
                </span>
              </div>
            </div>
          </div>

          {/* Audit Trail */}
          <div className="space-y-3">
            <h2 className="text-sm font-bold font-serif text-stone-900 dark:text-zinc-100">
              Recent Activity
            </h2>

            <div className="bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl p-4 text-xs space-y-3 shadow-xs">
              {auditLogs.slice(0, 4).map(log => (
                <div key={log.id} className="flex flex-col justify-between gap-0.5 pb-2.5 border-b border-[#E5E2D9] dark:border-zinc-800/80 last:border-0 last:pb-0">
                  <div className="text-stone-800 dark:text-zinc-200">
                    <span className="font-semibold text-stone-900 dark:text-zinc-100">{log.userName}:</span> {log.details}
                  </div>
                  <span className="text-[10px] text-stone-400 dark:text-zinc-500">{log.timestamp}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
