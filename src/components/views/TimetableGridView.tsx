import React, { useState } from 'react';
import { useTimetable } from '../../context/TimetableContext';
import { useAuth } from '../../context/AuthContext';
import { DayOfWeek, ClassSession } from '../../types';
import {
  Lock,
  Unlock,
  AlertCircle,
  XCircle,
  CheckCircle2,
  RotateCcw,
} from 'lucide-react';

export function TimetableGridView() {
  const {
    sessions,
    rooms,
    facultyMembers,
    sections,
    courses,
    academicYear,
    versions,
    activeVersionNumber,
    health,
    selectedSectionId,
    setSelectedSectionId,
    selectedFacultyId,
    setSelectedFacultyId,
    selectedRoomId,
    setSelectedRoomId,
    toggleSessionLock,
    cancelSession,
    addSession,
    publishMasterTimetable,
    setActiveView,
  } = useTimetable();
  const { currentUser } = useAuth();
  const isAdmin = ['COLLEGE_ADMIN', 'SUPER_ADMIN'].includes(currentUser?.roleCode ?? '');
  const canEdit = isAdmin || currentUser?.roleCode === 'COORDINATOR';

  const [filterMode, setFilterMode] = useState<'section' | 'faculty' | 'room'>('section');
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [cancellationReasonInput, setCancellationReasonInput] = useState('');
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [scheduleSlotTarget, setScheduleSlotTarget] = useState<{ day: DayOfWeek; timeSlotId: string } | null>(null);
  const [newCourseId, setNewCourseId] = useState('');
  const [newFacultyId, setNewFacultyId] = useState('');
  const [newRoomId, setNewRoomId] = useState('');
  const [newSectionId, setNewSectionId] = useState('');
  const [newSubSectionId, setNewSubSectionId] = useState('');
  const [newType, setNewType] = useState<'Lecture' | 'Lab' | 'Tutorial'>('Lecture');
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const [selectedMobileDay, setSelectedMobileDay] = useState<DayOfWeek | null>(null);
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  const days = academicYear.workingDays;
  const slots = academicYear.timeSlots;
  const mobileDay = selectedMobileDay && days.includes(selectedMobileDay) ? selectedMobileDay : days[0];
  const mobileIdx = days.indexOf(mobileDay);
  const slotLabel = (id: string) => slots.find(t => t.id === id)?.label ?? id;

  // Hard violations of the working draft as measured by the server's validator when the version was saved.
  const draftConflicts =
    versions.find(v => v.versionNumber === activeVersionNumber)?.hardViolationsCount ?? health.hardConstraintViolations;
  const canPublish = isAdmin && sessions.length > 0 && draftConflicts === 0 && !isBusy;

  const handlePublish = async () => {
    setIsBusy(true);
    await publishMasterTimetable();
    setIsBusy(false);
  };

  // Filter sessions based on active mode
  const filteredSessions = sessions.filter(s => {
    if (filterMode === 'section') return s.sectionId === selectedSectionId;
    if (filterMode === 'faculty') return s.facultyId === selectedFacultyId;
    return s.roomId === selectedRoomId;
  });

  const activeSessionDetail = sessions.find(s => s.id === activeSessionId) ?? null;

  const openAssign = (day: DayOfWeek, timeSlotId: string) => {
    setScheduleSlotTarget({ day, timeSlotId });
    setScheduleError(null);
    setNewCourseId('');
    setNewFacultyId(filterMode === 'faculty' ? selectedFacultyId : '');
    setNewRoomId(filterMode === 'room' ? selectedRoomId : '');
    setNewSectionId(filterMode === 'section' ? selectedSectionId : '');
    setNewSubSectionId('');
  };

  const handleAssign = async () => {
    if (!scheduleSlotTarget) return;
    setIsBusy(true);
    const result = await addSession({
      courseId: newCourseId,
      facultyId: newFacultyId,
      roomId: newRoomId,
      sectionId: newSectionId,
      subSectionId: newSubSectionId || undefined,
      day: scheduleSlotTarget.day,
      timeSlotId: scheduleSlotTarget.timeSlotId,
      type: newType,
      status: 'Planned',
    });
    setIsBusy(false);
    if (!result.isSuccess) {
      setScheduleError(result.error || 'The class could not be added.');
    } else {
      setScheduleSlotTarget(null);
    }
  };

  const handleToggleLock = async () => {
    if (!activeSessionDetail) return;
    setIsBusy(true);
    await toggleSessionLock(activeSessionDetail.id);
    setIsBusy(false);
  };

  const executeCancellation = async () => {
    if (!activeSessionDetail) return;
    setIsBusy(true);
    const res = await cancelSession(
      activeSessionDetail.id,
      cancellationReasonInput.trim() || 'Instructor unavailable (Personal/Administrative)'
    );
    setIsBusy(false);
    if (!res.success) return;
    setShowCancelModal(false);
    setActiveSessionId(null);
    setCancellationReasonInput('');
  };

  const dayCellClass = (day: DayOfWeek) => (day === mobileDay ? '' : 'hidden sm:table-cell');
  const assignSection = sections.find(s => s.id === newSectionId);
  const canAssign = Boolean(newCourseId && newFacultyId && newRoomId && newSectionId) && !isBusy;

  // Facts about the open session, computed from the current draft.
  const detailChecks = (() => {
    const d = activeSessionDetail;
    if (!d) return [];
    const others = sessions.filter(
      s => s.id !== d.id && s.status !== 'Cancelled' && s.day === d.day && s.timeSlotId === d.timeSlotId
    );
    const room = rooms.find(r => r.id === d.roomId);
    const section = sections.find(s => s.id === d.sectionId);
    const headcount = section?.subSections?.find(ss => ss.id === d.subSectionId)?.studentCount ?? section?.studentCount ?? 0;
    return [
      { ok: !others.some(s => s.facultyId === d.facultyId), pass: 'Teacher is not double-booked', fail: 'Teacher is double-booked in this slot' },
      { ok: !others.some(s => s.roomId === d.roomId), pass: 'Room is not double-booked', fail: 'Room is double-booked in this slot' },
      { ok: !room || room.capacity >= headcount, pass: `Room capacity fits ${headcount} students`, fail: `Room capacity ${room?.capacity} is below ${headcount} students` },
    ];
  })();

  const renderSession = (session: ClassSession) => {
    const course = courses.find(c => c.id === session.courseId);
    const faculty = facultyMembers.find(f => f.id === session.facultyId);
    const room = rooms.find(r => r.id === session.roomId);
    const section = sections.find(s => s.id === session.sectionId);
    const subName = section?.subSections?.find(ss => ss.id === session.subSectionId)?.name;

    const isCancelled = session.status === 'Cancelled';
    const isRescheduled = session.status === 'Rescheduled' || session.type === 'Makeup';

    return (
      <button
        key={session.id}
        onClick={() => setActiveSessionId(session.id)}
        className={`w-full text-left p-2.5 rounded-lg border transition-all relative ${
          isCancelled
            ? 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/50 text-rose-800 dark:text-rose-300'
            : isRescheduled
            ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/50 text-emerald-800 dark:text-emerald-300'
            : session.type === 'Lab'
            ? 'bg-blue-50/40 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900/40 text-stone-900 dark:text-zinc-100'
            : 'bg-white dark:bg-zinc-800/80 border-[#E5E2D9] dark:border-zinc-700/80 hover:border-stone-400 text-stone-900 dark:text-zinc-100 shadow-2xs'
        }`}
      >
        {/* Locked Pin Indicator */}
        {session.isLocked && (
          <span className="absolute top-2 right-2 text-stone-400" title={session.lockReason}>
            <Lock className="h-3 w-3" aria-label="Locked" />
          </span>
        )}

        <div className="flex items-center justify-between gap-1 mb-1">
          <span className="font-mono font-bold text-[#8C1B2E] dark:text-red-400 text-xs">
            {course?.code || session.courseId}
          </span>
          <span className={`text-[9px] px-1 rounded font-medium ${
            session.type === 'Lab'
              ? 'bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300'
              : session.type === 'Tutorial'
              ? 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300'
              : 'bg-stone-100 dark:bg-zinc-700 text-stone-600 dark:text-zinc-300'
          }`}>
            {session.type}{subName ? ` · ${subName}` : ''}
          </span>
        </div>

        <div className="text-xs font-semibold text-stone-900 dark:text-zinc-100 line-clamp-1">
          {course?.name}
        </div>

        <div className="text-[11px] text-stone-500 dark:text-zinc-400 mt-1 flex items-center justify-between gap-1">
          <span className="truncate">{filterMode === 'section' ? faculty?.name?.split(' ').pop() : section?.name}</span>
          <span className="font-mono">{room?.name ?? '—'}</span>
        </div>

        {isCancelled && (
          <div className="mt-1 text-[10px] font-semibold text-rose-700 dark:text-rose-400 flex items-center gap-1">
            <AlertCircle className="h-3 w-3" /> Cancelled
          </div>
        )}

        {isRescheduled && (
          <div className="mt-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
            <RotateCcw className="h-3 w-3" /> Rescheduled
          </div>
        )}
      </button>
    );
  };

  const selectClass =
    'bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 text-stone-800 dark:text-zinc-200 text-xs rounded-lg px-3 py-1.5 outline-none focus:border-[#8C1B2E] font-medium';
  const modalSelectClass =
    'w-full bg-white dark:bg-zinc-950 border border-[#E5E2D9] dark:border-zinc-800 rounded-lg p-2 text-stone-900 dark:text-zinc-100 outline-none focus:border-[#8C1B2E]';

  return (
    <div className="space-y-6 max-w-7xl mx-auto font-sans text-stone-900 dark:text-zinc-100">
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E5E2D9] dark:border-zinc-800 pb-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold font-serif tracking-tight">
            Timetable
          </h1>
          <p className="text-xs sm:text-sm text-stone-500 dark:text-zinc-400 mt-0.5">
            {activeVersionNumber != null ? `Working draft V${activeVersionNumber}` : 'View and manage the current timetable.'}
          </p>
        </div>

        {/* View Switcher, Publish & More Menu */}
        <div className="flex flex-wrap items-center gap-2">
          {/* View Switcher [ Section ] [ Faculty ] [ Room ] */}
          <div className="flex bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 p-0.5 rounded-lg text-xs font-semibold">
            {(['section', 'faculty', 'room'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setFilterMode(mode)}
                className={`px-3 py-1 rounded-md transition-colors capitalize ${
                  filterMode === mode
                    ? 'bg-[#8C1B2E] text-white shadow-xs'
                    : 'text-stone-600 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-200'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>

          {/* Sub-selector Dropdown */}
          {filterMode === 'section' && (
            <select aria-label="Section" value={selectedSectionId} onChange={e => setSelectedSectionId(e.target.value)} className={selectClass}>
              {sections.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.studentCount} students)
                </option>
              ))}
            </select>
          )}

          {filterMode === 'faculty' && (
            <select aria-label="Faculty" value={selectedFacultyId} onChange={e => setSelectedFacultyId(e.target.value)} className={selectClass}>
              {facultyMembers.map(f => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          )}

          {filterMode === 'room' && (
            <select aria-label="Room" value={selectedRoomId} onChange={e => setSelectedRoomId(e.target.value)} className={selectClass}>
              {rooms.map(r => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.capacity} cap)
                </option>
              ))}
            </select>
          )}

          {/* Publish Action Button (College Admin / Super Admin only) */}
          {isAdmin && (
            <button
              onClick={handlePublish}
              disabled={!canPublish}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all shadow-xs ${
                canPublish
                  ? 'bg-emerald-700 hover:bg-emerald-800 text-white cursor-pointer'
                  : 'bg-stone-200 dark:bg-zinc-800 text-stone-400 dark:text-zinc-500 cursor-not-allowed'
              }`}
              title={
                sessions.length === 0
                  ? 'There is no working draft to publish.'
                  : draftConflicts > 0
                  ? `Resolve ${draftConflicts} hard conflicts before publishing.`
                  : 'Publish master timetable'
              }
            >
              {isBusy ? 'Working…' : 'Publish'}
            </button>
          )}

          {/* More Menu Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowMoreMenu(!showMoreMenu)}
              aria-haspopup="menu"
              aria-expanded={showMoreMenu}
              className="px-3 py-1.5 rounded-lg border border-[#E5E2D9] dark:border-zinc-800 bg-[#FAF9F5] dark:bg-zinc-900 text-xs font-semibold text-stone-700 dark:text-zinc-300 hover:text-stone-900"
            >
              More ▾
            </button>

            {showMoreMenu && (
              <div className="absolute right-0 mt-1 w-48 bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-lg shadow-lg p-1 z-40 space-y-0.5 text-xs">
                <button
                  onClick={() => {
                    setActiveView('whatif');
                    setShowMoreMenu(false);
                  }}
                  className="w-full text-left px-3 py-2 rounded-md hover:bg-stone-100 dark:hover:bg-zinc-800 font-medium"
                >
                  What-If Simulator
                </button>
                <button
                  onClick={() => {
                    setActiveView('syllabus');
                    setShowMoreMenu(false);
                  }}
                  className="w-full text-left px-3 py-2 rounded-md hover:bg-stone-100 dark:hover:bg-zinc-800 font-medium"
                >
                  Syllabus Progress
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {sessions.length === 0 && (
        <div className="p-3 bg-stone-100 dark:bg-zinc-800 rounded-lg text-xs font-semibold text-stone-700 dark:text-zinc-300">
          No working draft yet — generate a timetable first.
        </div>
      )}

      {days.length === 0 || slots.length === 0 ? (
        <div className="p-6 bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl text-center text-xs text-stone-500">
          The academic year has no working days or time slots configured yet.
        </div>
      ) : (
        <>
          {/* Mobile Day Selector Bar */}
          <div className="sm:hidden flex items-center justify-between bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 p-2 rounded-xl text-xs font-semibold">
            <button
              onClick={() => mobileIdx > 0 && setSelectedMobileDay(days[mobileIdx - 1])}
              disabled={mobileIdx <= 0}
              className="px-2 py-1 disabled:opacity-30"
              aria-label="Previous day"
            >
              ‹ Prev
            </button>

            <span className="font-serif font-bold text-stone-900 dark:text-zinc-100 text-sm">{mobileDay}</span>

            <button
              onClick={() => mobileIdx < days.length - 1 && setSelectedMobileDay(days[mobileIdx + 1])}
              disabled={mobileIdx >= days.length - 1}
              className="px-2 py-1 disabled:opacity-30"
              aria-label="Next day"
            >
              Next ›
            </button>
          </div>

          {/* Timetable Grid Table (Canonical Matrix) */}
          <div className="bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs sm:min-w-[850px]">
                <thead>
                  <tr className="bg-[#F4F2EC] dark:bg-zinc-950/70 border-b border-[#E5E2D9] dark:border-zinc-800 text-stone-800 dark:text-zinc-300">
                    <th className="p-3 font-semibold w-24 text-stone-500 dark:text-zinc-400 border-r border-[#E5E2D9] dark:border-zinc-800 font-mono text-[11px]">
                      Time Slot
                    </th>
                    {days.map(d => (
                      <th
                        key={d}
                        className={`p-3 font-semibold text-center border-r border-[#E5E2D9] dark:border-zinc-800 last:border-r-0 ${dayCellClass(d)}`}
                      >
                        <div className="uppercase tracking-wider text-[11px] font-bold">{d}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E2D9] dark:divide-zinc-800">
                  {slots.map(slot => {
                    if (slot.isBreak || slot.isLunch || slot.id === academicYear.lunchPeriodId) {
                      return (
                        <tr key={slot.id} className="bg-[#F4F2EC] dark:bg-zinc-950/60">
                          <td className="p-2.5 font-mono text-[11px] text-stone-500 dark:text-zinc-400 border-r border-[#E5E2D9] dark:border-zinc-800 whitespace-nowrap">
                            {slot.startTime}–{slot.endTime}
                          </td>
                          <td colSpan={days.length} className="p-2.5 text-center text-xs font-medium text-stone-500 dark:text-zinc-400 tracking-wide">
                            {slot.isLunch || slot.id === academicYear.lunchPeriodId ? 'Lunch Break' : 'Break'}
                          </td>
                        </tr>
                      );
                    }

                    return (
                      <tr key={slot.id} className="hover:bg-white/40 dark:hover:bg-zinc-800/20 transition-colors">
                        <td className="p-2.5 font-mono text-[11px] text-stone-500 dark:text-zinc-400 border-r border-[#E5E2D9] dark:border-zinc-800 whitespace-nowrap align-top">
                          {slot.startTime}–{slot.endTime}
                        </td>
                        {days.map(day => {
                          // Parallel subgroup labs share a slot, so render every session here.
                          const cell = filteredSessions.filter(s => s.day === day && s.timeSlotId === slot.id);
                          return (
                            <td key={day} className={`p-1.5 border-r border-[#E5E2D9] dark:border-zinc-800 last:border-r-0 align-top ${dayCellClass(day)}`}>
                              {cell.length > 0 ? (
                                <div className="space-y-1">{cell.map(renderSession)}</div>
                              ) : canEdit ? (
                                <button
                                  onClick={() => openAssign(day, slot.id)}
                                  className="w-full h-16 rounded-lg border border-dashed border-[#E5E2D9] dark:border-zinc-700/80 hover:border-[#8C1B2E] hover:bg-[#8C1B2E]/5 flex flex-col items-center justify-center text-stone-400 hover:text-[#8C1B2E] text-[10px] transition-all group"
                                >
                                  <span className="font-medium">+ Assign</span>
                                  <span className="text-[9px] text-stone-400 group-hover:text-[#8C1B2E]">Free Slot</span>
                                </button>
                              ) : (
                                <div className="h-16" />
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
        </>
      )}

      {/* Session Inspector Modal */}
      {activeSessionDetail && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="session-detail-title"
            className="bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl max-w-lg w-full p-6 space-y-4 shadow-xl text-stone-900 dark:text-zinc-100"
          >
            <div className="flex items-start justify-between border-b border-[#E5E2D9] dark:border-zinc-800 pb-3">
              <div>
                <span className="text-[11px] font-mono font-bold text-[#8C1B2E] dark:text-red-400 uppercase tracking-wider">
                  Session Information
                </span>
                <h3 id="session-detail-title" className="text-base font-bold font-serif mt-0.5">
                  {courses.find(c => c.id === activeSessionDetail.courseId)?.code} ·{' '}
                  {courses.find(c => c.id === activeSessionDetail.courseId)?.name}
                </h3>
              </div>
              <button
                onClick={() => setActiveSessionId(null)}
                className="text-stone-400 hover:text-stone-700 dark:hover:text-zinc-200 p-1"
                aria-label="Close"
              >
                <XCircle className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-white dark:bg-zinc-950 rounded-lg border border-[#E5E2D9] dark:border-zinc-800">
                <span className="text-stone-400 block text-[10px]">Assigned Faculty</span>
                <span className="font-semibold text-stone-800 dark:text-zinc-200 mt-0.5 block">
                  {facultyMembers.find(f => f.id === activeSessionDetail.facultyId)?.name ?? '—'}
                </span>
              </div>

              <div className="p-3 bg-white dark:bg-zinc-950 rounded-lg border border-[#E5E2D9] dark:border-zinc-800">
                <span className="text-stone-400 block text-[10px]">Student Section</span>
                <span className="font-semibold text-stone-800 dark:text-zinc-200 mt-0.5 block">
                  {(() => {
                    const sec = sections.find(s => s.id === activeSessionDetail.sectionId);
                    const sub = sec?.subSections?.find(ss => ss.id === activeSessionDetail.subSectionId);
                    if (!sec) return '—';
                    return sub ? `${sec.name} · ${sub.name} (${sub.studentCount} Students)` : `${sec.name} (${sec.studentCount} Students)`;
                  })()}
                </span>
              </div>

              <div className="p-3 bg-white dark:bg-zinc-950 rounded-lg border border-[#E5E2D9] dark:border-zinc-800">
                <span className="text-stone-400 block text-[10px]">Classroom / Lab</span>
                <span className="font-semibold text-stone-800 dark:text-zinc-200 mt-0.5 block">
                  {rooms.find(r => r.id === activeSessionDetail.roomId)?.name ?? '—'}
                </span>
              </div>

              <div className="p-3 bg-white dark:bg-zinc-950 rounded-lg border border-[#E5E2D9] dark:border-zinc-800">
                <span className="text-stone-400 block text-[10px]">Schedule Window</span>
                <span className="font-semibold text-stone-800 dark:text-zinc-200 mt-0.5 block">
                  {activeSessionDetail.day} · {slotLabel(activeSessionDetail.timeSlotId)}
                </span>
              </div>
            </div>

            {/* Rule checks computed from the current draft */}
            <div className="p-3.5 bg-white dark:bg-zinc-950 rounded-lg border border-[#E5E2D9] dark:border-zinc-800 space-y-1.5 text-xs">
              <span className="text-[11px] font-semibold text-stone-900 dark:text-zinc-100">Scheduling Rule Checks</span>
              <ul className="text-[11px] space-y-0.5">
                {detailChecks.map(c => (
                  <li key={c.pass} className={`flex items-center gap-1.5 ${c.ok ? 'text-stone-500 dark:text-zinc-400' : 'text-rose-700 dark:text-rose-400 font-semibold'}`}>
                    {c.ok ? <CheckCircle2 className="h-3 w-3 text-emerald-600 shrink-0" /> : <AlertCircle className="h-3 w-3 shrink-0" />}
                    {c.ok ? c.pass : c.fail}
                  </li>
                ))}
              </ul>
            </div>

            {activeSessionDetail.isLocked && (
              <p className="text-[11px] text-stone-500 dark:text-zinc-400">
                Locked{activeSessionDetail.lockReason ? ` (${activeSessionDetail.lockReason})` : ''}: this session is kept fixed when the timetable is regenerated.
              </p>
            )}

            {/* Actions: Lock, Cancel */}
            {canEdit && (
              <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
                <button
                  onClick={handleToggleLock}
                  disabled={isBusy}
                  className={`w-full sm:w-auto flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-xs font-semibold border transition-all disabled:opacity-60 ${
                    activeSessionDetail.isLocked
                      ? 'bg-stone-100 dark:bg-zinc-800 border-[#E5E2D9] dark:border-zinc-700 text-stone-700 dark:text-zinc-300'
                      : 'bg-white dark:bg-zinc-800 border-[#E5E2D9] dark:border-zinc-700 text-stone-800 dark:text-zinc-200 hover:bg-stone-50'
                  }`}
                >
                  {activeSessionDetail.isLocked ? (
                    <>
                      <Unlock className="h-4 w-4" />
                      <span>Unlock Session</span>
                    </>
                  ) : (
                    <>
                      <Lock className="h-4 w-4" />
                      <span>Lock Session</span>
                    </>
                  )}
                </button>

                {activeSessionDetail.status !== 'Cancelled' ? (
                  <button
                    onClick={() => setShowCancelModal(true)}
                    className="w-full sm:w-auto flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-xs font-semibold bg-rose-700 hover:bg-rose-800 text-white transition-colors shadow-xs"
                  >
                    <XCircle className="h-4 w-4" />
                    <span>Cancel Class</span>
                  </button>
                ) : (
                  <div className="text-xs text-rose-700 dark:text-rose-400 font-semibold px-4 py-2 bg-rose-50 dark:bg-rose-950/40 rounded-lg border border-rose-200 dark:border-rose-900">
                    Status: Cancelled
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Cancellation Reason Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs z-60 flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancel-class-title"
            className="bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl max-w-md w-full p-6 space-y-4 shadow-xl text-stone-900 dark:text-zinc-100"
          >
            <h4 id="cancel-class-title" className="text-base font-bold font-serif text-stone-900 dark:text-zinc-100">Confirm Class Cancellation</h4>
            <p className="text-xs text-stone-500 dark:text-zinc-400 leading-relaxed">
              Cancelling marks the class cancelled and generates make-up options.
            </p>

            <div className="space-y-1.5">
              <label htmlFor="cancel-reason" className="text-xs font-medium text-stone-700 dark:text-zinc-300">Cancellation Reason</label>
              <input
                id="cancel-reason"
                type="text"
                placeholder="e.g. Faculty medical absence, Faculty symposium, Lab maintenance"
                value={cancellationReasonInput}
                onChange={e => setCancellationReasonInput(e.target.value)}
                className="w-full bg-white dark:bg-zinc-950 border border-[#E5E2D9] dark:border-zinc-800 rounded-lg p-2.5 text-xs text-stone-900 dark:text-zinc-100 outline-none focus:border-[#8C1B2E]"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setShowCancelModal(false)}
                className="px-4 py-2 rounded-lg text-xs font-medium text-stone-600 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-100"
              >
                Back
              </button>
              <button
                onClick={executeCancellation}
                disabled={isBusy}
                className="px-4 py-2 bg-rose-700 hover:bg-rose-800 disabled:opacity-60 text-white rounded-lg text-xs font-semibold transition-colors shadow-xs"
              >
                {isBusy ? 'Cancelling…' : 'Confirm Cancellation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Free Slot Direct Scheduling Modal */}
      {scheduleSlotTarget && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs z-60 flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="assign-slot-title"
            className="bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl max-w-md w-full p-6 space-y-4 shadow-xl text-stone-900 dark:text-zinc-100"
          >
            <div className="flex items-center justify-between border-b border-[#E5E2D9] dark:border-zinc-800 pb-3">
              <div>
                <h4 id="assign-slot-title" className="text-base font-bold font-serif text-stone-900 dark:text-zinc-100">Schedule Class Session</h4>
                <p className="text-[11px] text-stone-500 dark:text-zinc-400 mt-0.5">
                  Target: {scheduleSlotTarget.day} · {slotLabel(scheduleSlotTarget.timeSlotId)}
                </p>
              </div>
              <button
                onClick={() => setScheduleSlotTarget(null)}
                className="text-stone-400 hover:text-stone-700 dark:hover:text-zinc-200"
                aria-label="Close"
              >
                <XCircle className="h-5 w-5" />
              </button>
            </div>

            {scheduleError && (
              <div role="alert" className="p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded-lg text-rose-800 dark:text-rose-300 text-xs flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{scheduleError}</span>
              </div>
            )}

            <div className="space-y-3 text-xs">
              <div>
                <label htmlFor="assign-course" className="text-stone-700 dark:text-zinc-300 block mb-1 font-medium">Course</label>
                <select id="assign-course" value={newCourseId} onChange={e => setNewCourseId(e.target.value)} className={modalSelectClass}>
                  <option value="">Select a course…</option>
                  {courses.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.code}: {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="assign-faculty" className="text-stone-700 dark:text-zinc-300 block mb-1 font-medium">Instructor</label>
                <select id="assign-faculty" value={newFacultyId} onChange={e => setNewFacultyId(e.target.value)} className={modalSelectClass}>
                  <option value="">Select an instructor…</option>
                  {facultyMembers.map(f => (
                    <option key={f.id} value={f.id}>
                      {f.name} ({f.designation})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="assign-room" className="text-stone-700 dark:text-zinc-300 block mb-1 font-medium">Classroom / Lab</label>
                <select id="assign-room" value={newRoomId} onChange={e => setNewRoomId(e.target.value)} className={modalSelectClass}>
                  <option value="">Select a room…</option>
                  {rooms.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.type} · Cap {r.capacity})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="assign-section" className="text-stone-700 dark:text-zinc-300 block mb-1 font-medium">Student Section</label>
                  <select
                    id="assign-section"
                    value={newSectionId}
                    onChange={e => {
                      setNewSectionId(e.target.value);
                      setNewSubSectionId('');
                    }}
                    className={modalSelectClass}
                  >
                    <option value="">Select a section…</option>
                    {sections.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.studentCount} students)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="assign-subgroup" className="text-stone-700 dark:text-zinc-300 block mb-1 font-medium">Subgroup</label>
                  <select id="assign-subgroup" value={newSubSectionId} onChange={e => setNewSubSectionId(e.target.value)} className={modalSelectClass}>
                    <option value="">Whole section</option>
                    {(assignSection?.subSections ?? []).map(ss => (
                      <option key={ss.id} value={ss.id}>
                        {ss.name} ({ss.studentCount})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="assign-type" className="text-stone-700 dark:text-zinc-300 block mb-1 font-medium">Session Type</label>
                <select id="assign-type" value={newType} onChange={e => setNewType(e.target.value as typeof newType)} className={modalSelectClass}>
                  <option value="Lecture">Lecture</option>
                  <option value="Lab">Lab</option>
                  <option value="Tutorial">Tutorial</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#E5E2D9] dark:border-zinc-800">
              <button
                onClick={() => setScheduleSlotTarget(null)}
                className="px-4 py-2 rounded-lg text-xs font-medium text-stone-600 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-100"
              >
                Cancel
              </button>
              <button
                onClick={handleAssign}
                disabled={!canAssign}
                className="px-4 py-2 bg-[#8C1B2E] hover:bg-[#721525] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-xs font-semibold transition-all shadow-xs"
              >
                {isBusy ? 'Assigning…' : 'Assign Slot'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
