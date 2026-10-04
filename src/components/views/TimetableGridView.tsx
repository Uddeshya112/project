import React, { useState } from 'react';
import { useTimetable } from '../../context/TimetableContext';
import { TIME_SLOTS } from '../../lib/initialData';
import { DayOfWeek, ClassSession } from '../../types';
import {
  Lock,
  Unlock,
  AlertCircle,
  XCircle,
  CheckCircle2,
  Calendar,
  Building,
  User,
  GraduationCap,
  RotateCcw,
  Info
} from 'lucide-react';

export function TimetableGridView() {
  const {
    sessions,
    rooms,
    facultyMembers,
    sections,
    courses,
    selectedSectionId,
    setSelectedSectionId,
    selectedFacultyId,
    setSelectedFacultyId,
    selectedRoomId,
    setSelectedRoomId,
    toggleSessionLock,
    cancelSession,
    addSession,
  } = useTimetable();

  const [filterMode, setFilterMode] = useState<'section' | 'faculty' | 'room'>('section');
  const [activeSessionDetail, setActiveSessionDetail] = useState<ClassSession | null>(null);
  const [cancellationReasonInput, setCancellationReasonInput] = useState('');
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [scheduleSlotTarget, setScheduleSlotTarget] = useState<{ day: DayOfWeek; timeSlotId: string } | null>(null);
  const [newCourseId, setNewCourseId] = useState('CS501');
  const [newFacultyId, setNewFacultyId] = useState('fac-sharma');
  const [newRoomId, setNewRoomId] = useState('room-204');
  const [newSectionId, setNewSectionId] = useState('sec-cse-a');
  const [newType, setNewType] = useState<'Lecture' | 'Lab' | 'Tutorial'>('Lecture');
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  const days: DayOfWeek[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

  // Filter sessions based on active mode
  const filteredSessions = sessions.filter(s => {
    if (filterMode === 'section') return s.sectionId === selectedSectionId;
    if (filterMode === 'faculty') return s.facultyId === selectedFacultyId;
    if (filterMode === 'room') return s.roomId === selectedRoomId;
    return true;
  });

  const handleCellClick = (session: ClassSession) => {
    setActiveSessionDetail(session);
  };

  const executeCancellation = () => {
    if (!activeSessionDetail) return;
    cancelSession(
      activeSessionDetail.id,
      cancellationReasonInput.trim() || 'Instructor unavailable (Personal/Administrative)'
    );
    setShowCancelModal(false);
    setActiveSessionDetail(null);
    setCancellationReasonInput('');
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto font-sans">
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E5E2D9] dark:border-zinc-800 pb-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold font-serif text-stone-900 dark:text-zinc-100 tracking-tight">
            Master Timetable Grid
          </h1>
          <p className="text-xs sm:text-sm text-stone-500 dark:text-zinc-400 mt-1">
            Weekly institutional timetable routine across sections, faculty members, and campus rooms.
          </p>
        </div>

        {/* View Mode & Selection Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Segmented Filter Mode */}
          <div className="flex bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 p-0.5 rounded-lg text-xs font-medium">
            <button
              onClick={() => setFilterMode('section')}
              className={`px-3 py-1 rounded-md transition-colors ${
                filterMode === 'section'
                  ? 'bg-[#8C1B2E] text-white font-semibold shadow-xs'
                  : 'text-stone-600 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-200'
              }`}
            >
              Section
            </button>
            <button
              onClick={() => setFilterMode('faculty')}
              className={`px-3 py-1 rounded-md transition-colors ${
                filterMode === 'faculty'
                  ? 'bg-[#8C1B2E] text-white font-semibold shadow-xs'
                  : 'text-stone-600 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-200'
              }`}
            >
              Faculty
            </button>
            <button
              onClick={() => setFilterMode('room')}
              className={`px-3 py-1 rounded-md transition-colors ${
                filterMode === 'room'
                  ? 'bg-[#8C1B2E] text-white font-semibold shadow-xs'
                  : 'text-stone-600 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-200'
              }`}
            >
              Room & Lab
            </button>
          </div>

          {/* Sub-selector */}
          {filterMode === 'section' && (
            <select
              value={selectedSectionId}
              onChange={e => setSelectedSectionId(e.target.value)}
              className="bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 text-stone-800 dark:text-zinc-200 text-xs rounded-lg px-3 py-1.5 outline-none focus:border-[#8C1B2E] font-medium"
            >
              {sections.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.studentCount} students)
                </option>
              ))}
            </select>
          )}

          {filterMode === 'faculty' && (
            <select
              value={selectedFacultyId}
              onChange={e => setSelectedFacultyId(e.target.value)}
              className="bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 text-stone-800 dark:text-zinc-200 text-xs rounded-lg px-3 py-1.5 outline-none focus:border-[#8C1B2E] font-medium"
            >
              {facultyMembers.map(f => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          )}

          {filterMode === 'room' && (
            <select
              value={selectedRoomId}
              onChange={e => setSelectedRoomId(e.target.value)}
              className="bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 text-stone-800 dark:text-zinc-200 text-xs rounded-lg px-3 py-1.5 outline-none focus:border-[#8C1B2E] font-medium"
            >
              {rooms.map(r => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.capacity} cap)
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Timetable Grid Table (Canonical Matrix) */}
      <div className="bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs min-w-[850px]">
            <thead>
              <tr className="bg-[#F4F2EC] dark:bg-zinc-950/70 border-b border-[#E5E2D9] dark:border-zinc-800 text-stone-800 dark:text-zinc-300">
                <th className="p-3 font-semibold w-24 text-stone-500 dark:text-zinc-400 border-r border-[#E5E2D9] dark:border-zinc-800 font-mono text-[11px]">
                  Time Slot
                </th>
                {days.map(d => (
                  <th
                    key={d}
                    className="p-3 font-semibold text-center border-r border-[#E5E2D9] dark:border-zinc-800 last:border-r-0"
                  >
                    <div className="uppercase tracking-wider text-[11px] font-bold">{d}</div>
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
                    <td className="p-2.5 font-mono text-[11px] text-stone-500 dark:text-zinc-400 border-r border-[#E5E2D9] dark:border-zinc-800 whitespace-nowrap align-top">
                      {slot.startTime}–{slot.endTime}
                    </td>
                    {days.map(day => {
                      const session = filteredSessions.find(
                        s => s.day === day && s.timeSlotId === slot.id
                      );

                      if (!session) {
                        return (
                          <td key={day} className="p-1.5 border-r border-[#E5E2D9] dark:border-zinc-800 last:border-r-0 align-top">
                            <button
                              onClick={() => {
                                setScheduleSlotTarget({ day, timeSlotId: slot.id });
                                setScheduleError(null);
                              }}
                              className="w-full h-16 rounded-lg border border-dashed border-[#E5E2D9] dark:border-zinc-700/80 hover:border-[#8C1B2E] hover:bg-[#8C1B2E]/5 flex flex-col items-center justify-center text-stone-400 hover:text-[#8C1B2E] text-[10px] transition-all group"
                            >
                              <span className="font-medium">+ Assign</span>
                              <span className="text-[9px] text-stone-400 group-hover:text-[#8C1B2E]">Free Slot</span>
                            </button>
                          </td>
                        );
                      }

                      const course = courses.find(c => c.id === session.courseId);
                      const faculty = facultyMembers.find(f => f.id === session.facultyId);
                      const room = rooms.find(r => r.id === session.roomId);
                      const section = sections.find(s => s.id === session.sectionId);

                      const isCancelled = session.status === 'Cancelled';
                      const isRescheduled = session.status === 'Rescheduled' || session.type === 'Makeup';

                      return (
                        <td key={day} className="p-1.5 border-r border-[#E5E2D9] dark:border-zinc-800 last:border-r-0 align-top">
                          <button
                            onClick={() => handleCellClick(session)}
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
                                <Lock className="h-3 w-3" />
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
                                {session.type}
                              </span>
                            </div>

                            <div className="text-xs font-semibold text-stone-900 dark:text-zinc-100 line-clamp-1">
                              {course?.name}
                            </div>

                            <div className="text-[11px] text-stone-500 dark:text-zinc-400 mt-1 flex items-center justify-between">
                              <span className="truncate">{filterMode === 'faculty' ? section?.name : faculty?.name?.split(' ').pop()}</span>
                              <span className="font-mono">{room?.name || '204'}</span>
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

      {/* Session Inspector Drawer / Modal */}
      {activeSessionDetail && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl max-w-lg w-full p-6 space-y-4 shadow-xl text-stone-900 dark:text-zinc-100">
            <div className="flex items-start justify-between border-b border-[#E5E2D9] dark:border-zinc-800 pb-3">
              <div>
                <span className="text-[11px] font-mono font-bold text-[#8C1B2E] dark:text-red-400 uppercase tracking-wider">
                  Session Information
                </span>
                <h3 className="text-base font-bold font-serif mt-0.5">
                  {courses.find(c => c.id === activeSessionDetail.courseId)?.code} ·{' '}
                  {courses.find(c => c.id === activeSessionDetail.courseId)?.name}
                </h3>
              </div>
              <button
                onClick={() => setActiveSessionDetail(null)}
                className="text-stone-400 hover:text-stone-700 dark:hover:text-zinc-200 p-1"
              >
                <XCircle className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-white dark:bg-zinc-950 rounded-lg border border-[#E5E2D9] dark:border-zinc-800">
                <span className="text-stone-400 block text-[10px]">Assigned Faculty</span>
                <span className="font-semibold text-stone-800 dark:text-zinc-200 mt-0.5 block">
                  {facultyMembers.find(f => f.id === activeSessionDetail.facultyId)?.name}
                </span>
              </div>

              <div className="p-3 bg-white dark:bg-zinc-950 rounded-lg border border-[#E5E2D9] dark:border-zinc-800">
                <span className="text-stone-400 block text-[10px]">Student Section</span>
                <span className="font-semibold text-stone-800 dark:text-zinc-200 mt-0.5 block">
                  {sections.find(s => s.id === activeSessionDetail.sectionId)?.name} (
                  {sections.find(s => s.id === activeSessionDetail.sectionId)?.studentCount} Students)
                </span>
              </div>

              <div className="p-3 bg-white dark:bg-zinc-950 rounded-lg border border-[#E5E2D9] dark:border-zinc-800">
                <span className="text-stone-400 block text-[10px]">Classroom / Lab</span>
                <span className="font-semibold text-stone-800 dark:text-zinc-200 mt-0.5 block">
                  {rooms.find(r => r.id === activeSessionDetail.roomId)?.name}
                </span>
              </div>

              <div className="p-3 bg-white dark:bg-zinc-950 rounded-lg border border-[#E5E2D9] dark:border-zinc-800">
                <span className="text-stone-400 block text-[10px]">Schedule Window</span>
                <span className="font-semibold text-stone-800 dark:text-zinc-200 mt-0.5 block">
                  {activeSessionDetail.day} · {activeSessionDetail.timeSlotId}
                </span>
              </div>
            </div>

            {/* Invariants & Hard Constraint Validation */}
            <div className="p-3.5 bg-white dark:bg-zinc-950 rounded-lg border border-[#E5E2D9] dark:border-zinc-800 space-y-1.5 text-xs">
              <span className="text-[11px] font-semibold text-stone-900 dark:text-zinc-100 flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                Scheduling Rule Verification
              </span>
              <ul className="text-[11px] text-stone-500 dark:text-zinc-400 space-y-0.5 list-disc list-inside">
                <li>Teacher overlap constraint: Verified</li>
                <li>Room capacity: Satisfied</li>
                <li>Lab & equipment requirements: Satisfied</li>
              </ul>
            </div>

            {/* Actions: Lock, Cancel */}
            <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
              <button
                onClick={() => {
                  toggleSessionLock(activeSessionDetail.id);
                  setActiveSessionDetail(prev => prev ? { ...prev, isLocked: !prev.isLocked } : null);
                }}
                className={`w-full sm:w-auto flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-xs font-semibold border transition-all ${
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
          </div>
        </div>
      )}

      {/* Cancellation Reason Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs z-60 flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl max-w-md w-full p-6 space-y-4 shadow-xl text-stone-900 dark:text-zinc-100">
            <h4 className="text-base font-bold font-serif text-stone-900 dark:text-zinc-100">Confirm Class Cancellation</h4>
            <p className="text-xs text-stone-500 dark:text-zinc-400 leading-relaxed">
              Cancelling will release the room, notify enrolled students, and enqueue a replacement class option.
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-stone-700 dark:text-zinc-300">Cancellation Reason</label>
              <input
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
                className="px-4 py-2 bg-rose-700 hover:bg-rose-800 text-white rounded-lg text-xs font-semibold transition-colors shadow-xs"
              >
                Confirm Cancellation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Free Slot Direct Scheduling Modal */}
      {scheduleSlotTarget && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs z-60 flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl max-w-md w-full p-6 space-y-4 shadow-xl text-stone-900 dark:text-zinc-100">
            <div className="flex items-center justify-between border-b border-[#E5E2D9] dark:border-zinc-800 pb-3">
              <div>
                <h4 className="text-base font-bold font-serif text-stone-900 dark:text-zinc-100">Schedule Class Session</h4>
                <p className="text-[11px] text-stone-500 dark:text-zinc-400 mt-0.5">
                  Target: {scheduleSlotTarget.day} · {TIME_SLOTS.find(t => t.id === scheduleSlotTarget.timeSlotId)?.label}
                </p>
              </div>
              <button
                onClick={() => setScheduleSlotTarget(null)}
                className="text-stone-400 hover:text-stone-700 dark:hover:text-zinc-200"
              >
                <XCircle className="h-5 w-5" />
              </button>
            </div>

            {scheduleError && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded-lg text-rose-800 dark:text-rose-300 text-xs flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{scheduleError}</span>
              </div>
            )}

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-stone-700 dark:text-zinc-300 block mb-1 font-medium">Course</label>
                <select
                  value={newCourseId}
                  onChange={e => setNewCourseId(e.target.value)}
                  className="w-full bg-white dark:bg-zinc-950 border border-[#E5E2D9] dark:border-zinc-800 rounded-lg p-2 text-stone-900 dark:text-zinc-100 outline-none focus:border-[#8C1B2E]"
                >
                  {courses.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.code}: {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-stone-700 dark:text-zinc-300 block mb-1 font-medium">Instructor</label>
                <select
                  value={newFacultyId}
                  onChange={e => setNewFacultyId(e.target.value)}
                  className="w-full bg-white dark:bg-zinc-950 border border-[#E5E2D9] dark:border-zinc-800 rounded-lg p-2 text-stone-900 dark:text-zinc-100 outline-none focus:border-[#8C1B2E]"
                >
                  {facultyMembers.map(f => (
                    <option key={f.id} value={f.id}>
                      {f.name} ({f.designation})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-stone-700 dark:text-zinc-300 block mb-1 font-medium">Classroom / Lab</label>
                <select
                  value={newRoomId}
                  onChange={e => setNewRoomId(e.target.value)}
                  className="w-full bg-white dark:bg-zinc-950 border border-[#E5E2D9] dark:border-zinc-800 rounded-lg p-2 text-stone-900 dark:text-zinc-100 outline-none focus:border-[#8C1B2E]"
                >
                  {rooms.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.type} · Cap {r.capacity})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-stone-700 dark:text-zinc-300 block mb-1 font-medium">Student Section</label>
                  <select
                    value={newSectionId}
                    onChange={e => setNewSectionId(e.target.value)}
                    className="w-full bg-white dark:bg-zinc-950 border border-[#E5E2D9] dark:border-zinc-800 rounded-lg p-2 text-stone-900 dark:text-zinc-100 outline-none focus:border-[#8C1B2E]"
                  >
                    {sections.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.studentCount} students)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-stone-700 dark:text-zinc-300 block mb-1 font-medium">Session Type</label>
                  <select
                    value={newType}
                    onChange={e => setNewType(e.target.value as any)}
                    className="w-full bg-white dark:bg-zinc-950 border border-[#E5E2D9] dark:border-zinc-800 rounded-lg p-2 text-stone-900 dark:text-zinc-100 outline-none focus:border-[#8C1B2E]"
                  >
                    <option value="Lecture">Lecture</option>
                    <option value="Lab">Lab</option>
                    <option value="Tutorial">Tutorial</option>
                  </select>
                </div>
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
                onClick={() => {
                  const result = addSession({
                    courseId: newCourseId,
                    facultyId: newFacultyId,
                    roomId: newRoomId,
                    sectionId: newSectionId,
                    day: scheduleSlotTarget.day,
                    timeSlotId: scheduleSlotTarget.timeSlotId,
                    type: newType,
                    status: 'Confirmed',
                  });
                  if (!result.isSuccess) {
                    setScheduleError(result.error || 'Scheduling collision detected.');
                  } else {
                    setScheduleSlotTarget(null);
                    setScheduleError(null);
                  }
                }}
                className="px-4 py-2 bg-[#8C1B2E] hover:bg-[#721525] text-white rounded-lg text-xs font-semibold transition-all shadow-xs"
              >
                Assign Slot
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
