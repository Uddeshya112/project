import React, { useState } from 'react';
import { useTimetable } from '../../context/TimetableContext';
import { useAuth } from '../../context/AuthContext';
import { TIME_SLOTS } from '../../lib/initialData';
import { DayOfWeek } from '../../types';
import {
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ShieldCheck,
  BookOpen,
  Plus,
  Check,
  MessageSquare,
  MapPin
} from 'lucide-react';

export function FacultyPortalView() {
  const { currentUser } = useAuth();
  const {
    facultyMembers,
    sessions,
    courses,
    sections,
    rooms,
    scheduleMakeup,
    declineOpportunity,
    claimMarketplaceSlot,
    setFacultyProtectedSlot,
    cancelSession,
  } = useTimetable();

  // Resolve logged-in faculty member - showing only their own data
  const currentFaculty = facultyMembers.find(
    f => f.email?.toLowerCase() === currentUser?.email?.toLowerCase() ||
         f.name?.toLowerCase().includes(currentUser?.name?.split(' ')[0].toLowerCase() || '')
  ) || facultyMembers[0];

  const [selectedDay, setSelectedDay] = useState<DayOfWeek>('Monday');
  
  // Modals & Toast State
  const [showCancelModal, setShowCancelModal] = useState<boolean>(false);
  const [sessionToCancel, setSessionToCancel] = useState<string | null>(null);
  const [cancellationReason, setCancellationReason] = useState<string>('');

  const [showDeclineModal, setShowDeclineModal] = useState<boolean>(false);
  const [declineReason, setDeclineReason] = useState<string>('');

  const [replacementStatus, setReplacementStatus] = useState<'pending' | 'confirmed' | 'declined'>('pending');
  const [claimedSlots, setClaimedSlots] = useState<Record<string, boolean>>({});
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Daily class schedule for logged-in teacher on selected day
  const dailySessions = sessions.filter(
    s => s.facultyId === currentFaculty.id && s.day === selectedDay
  );

  const days: DayOfWeek[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleProtectedToggle = (periodId: string) => {
    setFacultyProtectedSlot(currentFaculty.id, selectedDay, periodId, 'Research');
    showToast(`Period status updated for ${selectedDay}.`);
  };

  const handleExecuteCancel = () => {
    if (!sessionToCancel) return;
    cancelSession(sessionToCancel, cancellationReason || 'Medical leave');
    setShowCancelModal(false);
    setSessionToCancel(null);
    setCancellationReason('');
    showToast('Class cancelled. Students have been notified and a replacement class will be suggested.');
  };

  const handleAcceptReplacement = () => {
    scheduleMakeup('rec-opp-01');
    setReplacementStatus('confirmed');
    showToast('Replacement class confirmed! Added to your timetable and students notified.');
  };

  const handleConfirmDecline = () => {
    declineOpportunity('rec-opp-01');
    setReplacementStatus('declined');
    setShowDeclineModal(false);
    setDeclineReason('');
    showToast('Class suggestion declined.');
  };

  const handleClaimSlot = (slotKey: string, courseCode: string, sectionName: string, day: DayOfWeek, slotId: string, roomName: string) => {
    claimMarketplaceSlot(courseCode, sectionName, day, slotId, roomName, 'Tutorial');
    setClaimedSlots(prev => ({ ...prev, [slotKey]: true }));
    showToast(`Class added to your timetable! ${courseCode} (${sectionName}) on ${day}.`);
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Toast Banner */}
      {toastMessage && (
        <div className="fixed top-16 right-4 z-50 bg-slate-900 text-white dark:bg-zinc-100 dark:text-zinc-900 px-4 py-3 rounded-xl shadow-xl border border-slate-700 dark:border-zinc-300 text-xs font-semibold flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-400 dark:text-emerald-600 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header - Teacher Name & Department */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E5E2D9] dark:border-zinc-800 pb-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold font-serif text-stone-900 dark:text-zinc-100 tracking-tight">
            {currentUser?.name || currentFaculty.name}
          </h1>
          <p className="text-xs sm:text-sm text-stone-500 dark:text-zinc-400 mt-1">
            {currentFaculty.designation} · Department of Computer Science & Engineering
          </p>
        </div>

        <div className="flex items-center gap-2 bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 px-3 py-1.5 rounded-lg text-xs text-stone-700 dark:text-zinc-300 font-medium shadow-2xs">
          <BookOpen className="h-4 w-4 text-[#8C1B2E] dark:text-red-400" />
          <span>Faculty Portal</span>
        </div>
      </div>

      {/* Workload Summary Card */}
      <div className="bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl p-5 space-y-3.5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#E5E2D9] dark:border-zinc-800/80 pb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />
            <span className="text-xs font-bold text-stone-900 dark:text-zinc-100 font-serif">
              Weekly Teaching Workload Summary
            </span>
          </div>
          <span className="text-xs text-stone-500 dark:text-zinc-400 font-medium">
            Maximum Limit: {currentFaculty.maxDirectTeachingHours} hours per week
          </span>
        </div>
        <p className="text-[11px] text-stone-500 dark:text-zinc-400 leading-relaxed">
          Overview of your weekly teaching hours, laboratory sessions, office consultation, and research time.
        </p>

        {/* Workload Breakdown Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5 text-center text-xs">
          <div className="p-3 bg-white dark:bg-zinc-950/60 rounded-lg border border-[#E5E2D9] dark:border-zinc-800 shadow-2xs">
            <span className="text-stone-500 dark:text-zinc-400 block text-[11px]">Direct Teaching</span>
            <span className="text-base font-bold text-stone-900 dark:text-zinc-100 mt-0.5 block font-serif">14 hrs</span>
            <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-medium">Within Limit</span>
          </div>

          <div className="p-3 bg-white dark:bg-zinc-950/60 rounded-lg border border-[#E5E2D9] dark:border-zinc-800 shadow-2xs">
            <span className="text-stone-500 dark:text-zinc-400 block text-[11px]">Tutorials</span>
            <span className="text-base font-bold text-stone-900 dark:text-zinc-100 mt-0.5 block font-serif">2 hrs</span>
            <span className="text-[10px] text-stone-500">Scheduled</span>
          </div>

          <div className="p-3 bg-white dark:bg-zinc-950/60 rounded-lg border border-[#E5E2D9] dark:border-zinc-800 shadow-2xs">
            <span className="text-stone-500 dark:text-zinc-400 block text-[11px]">Laboratory</span>
            <span className="text-base font-bold text-stone-900 dark:text-zinc-100 mt-0.5 block font-serif">2 hrs</span>
            <span className="text-[10px] text-stone-500">Lab 301</span>
          </div>

          <div className="p-3 bg-white dark:bg-zinc-950/60 rounded-lg border border-[#E5E2D9] dark:border-zinc-800 shadow-2xs">
            <span className="text-stone-500 dark:text-zinc-400 block text-[11px]">Consultation</span>
            <span className="text-base font-bold text-stone-900 dark:text-zinc-100 mt-0.5 block font-serif">2 hrs</span>
            <span className="text-[10px] text-stone-500">Office Hours</span>
          </div>

          <div className="p-3 bg-white dark:bg-zinc-950/60 rounded-lg border border-[#E5E2D9] dark:border-zinc-800 shadow-2xs">
            <span className="text-stone-500 dark:text-zinc-400 block text-[11px]">Research Time</span>
            <span className="text-base font-bold text-stone-900 dark:text-zinc-100 mt-0.5 block font-serif">6 hrs</span>
            <span className="text-[10px] text-[#8C1B2E] dark:text-red-400 font-medium">Free Period</span>
          </div>

          <div className="p-3 bg-white dark:bg-zinc-950/60 rounded-lg border border-[#E5E2D9] dark:border-zinc-800 shadow-2xs">
            <span className="text-stone-500 dark:text-zinc-400 block text-[11px]">Department Work</span>
            <span className="text-base font-bold text-stone-900 dark:text-zinc-100 mt-0.5 block font-serif">1 hr</span>
            <span className="text-[10px] text-stone-500">Committee</span>
          </div>
        </div>
      </div>

      {/* Main Grid: Class Schedule & Replacement Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Columns: Daily Class Schedule */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl overflow-hidden shadow-xs">
            {/* Day Selector */}
            <div className="p-3.5 border-b border-[#E5E2D9] dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-[#F4F2EC] dark:bg-zinc-950/50">
              <div className="text-xs font-bold font-serif text-stone-900 dark:text-zinc-100 flex items-center gap-2">
                <Calendar className="h-4 w-4 text-[#8C1B2E] dark:text-red-400" />
                <span>Class Schedule for {selectedDay}</span>
              </div>

              <div className="flex bg-[#E5E2D9]/60 dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 p-0.5 rounded-lg text-xs">
                {days.map(d => (
                  <button
                    key={d}
                    onClick={() => setSelectedDay(d)}
                    className={`px-2.5 py-1 rounded-md transition-colors font-medium ${
                      selectedDay === d
                        ? 'bg-[#8C1B2E] text-white font-semibold shadow-2xs'
                        : 'text-stone-700 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-200'
                    }`}
                  >
                    {d.slice(0, 3)}
                  </button>
                ))}
              </div>
            </div>

            {/* List of Periods */}
            <div className="divide-y divide-[#E5E2D9] dark:divide-zinc-800/80">
              {TIME_SLOTS.map(slot => {
                const isLunch = slot.id === 'ts-5';
                const session = dailySessions.find(s => s.timeSlotId === slot.id);
                const protectedBlock = currentFaculty.preferences.protectedSlots.find(
                  ps => ps.day === selectedDay && ps.periodId === slot.id
                );

                if (isLunch) {
                  return (
                    <div key={slot.id} className="p-3 bg-[#F4F2EC] dark:bg-zinc-950/40 flex items-center justify-between text-xs text-stone-500 dark:text-zinc-500">
                      <span className="font-mono text-[11px]">{slot.startTime} – {slot.endTime}</span>
                      <span className="font-medium text-stone-700 dark:text-zinc-300">Lunch Break</span>
                      <span className="text-[11px] text-stone-400">No classes scheduled</span>
                    </div>
                  );
                }

                return (
                  <div
                    key={slot.id}
                    className={`p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs transition-colors ${
                      session?.status === 'Cancelled'
                        ? 'bg-rose-50/60 dark:bg-rose-950/20'
                        : protectedBlock
                        ? 'bg-[#F4F2EC]/60 dark:bg-zinc-950/60'
                        : 'hover:bg-white dark:hover:bg-zinc-800/50'
                    }`}
                  >
                    <div className="flex items-center gap-2 text-stone-600 dark:text-zinc-400 w-36 shrink-0 font-medium font-mono text-[11px]">
                      <Clock className="h-3.5 w-3.5 text-stone-400" />
                      <span>{slot.startTime} – {slot.endTime}</span>
                    </div>

                    <div className="flex-1">
                      {session ? (
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="font-bold text-stone-900 dark:text-zinc-100 flex items-center gap-2">
                              <span className="font-mono text-[#8C1B2E] dark:text-red-400">{courses.find(c => c.id === session.courseId)?.code}</span>
                              <span className="text-stone-800 dark:text-zinc-200">({courses.find(c => c.id === session.courseId)?.name})</span>
                              <span className="text-stone-400">·</span>
                              <span className="text-stone-600 dark:text-zinc-400">{sections.find(s => s.id === session.sectionId)?.name}</span>
                              {session.status === 'Cancelled' && (
                                <span className="text-[10px] px-2 py-0.5 rounded bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60 font-semibold">
                                  Cancelled
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-stone-500 dark:text-zinc-400 mt-0.5 flex items-center gap-1.5">
                              <MapPin className="h-3 w-3 text-stone-400" />
                              <span>Room: {rooms.find(r => r.id === session.roomId)?.name || 'LT101'}</span>
                            </div>
                          </div>

                          {session.status !== 'Cancelled' && (
                            <button
                              onClick={() => {
                                setSessionToCancel(session.id);
                                setShowCancelModal(true);
                              }}
                              className="px-3 py-1.5 bg-white dark:bg-zinc-800 hover:bg-rose-50 hover:text-rose-800 dark:hover:bg-rose-950/60 dark:hover:text-rose-300 text-stone-700 dark:text-zinc-300 border border-[#E5E2D9] dark:border-zinc-700 rounded-lg text-xs font-semibold transition-colors shrink-0 shadow-2xs"
                            >
                              Cancel this class
                            </button>
                          )}
                        </div>
                      ) : protectedBlock ? (
                        <div className="flex items-center justify-between">
                          <span className="text-stone-600 dark:text-zinc-400 font-medium">
                            Free period (Reserved)
                          </span>
                          <button
                            onClick={() => handleProtectedToggle(slot.id)}
                            className="text-xs text-stone-500 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-200 underline"
                          >
                            Release
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <span className="text-stone-400 dark:text-zinc-500 italic">Free period</span>
                          <button
                            onClick={() => handleProtectedToggle(slot.id)}
                            className="px-2.5 py-1 bg-white dark:bg-zinc-800 hover:bg-stone-50 dark:hover:bg-zinc-700 text-stone-700 dark:text-zinc-300 rounded-lg text-xs font-medium border border-[#E5E2D9] dark:border-zinc-700 transition-colors shadow-2xs"
                          >
                            Keep this period free
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: Replacement Class Suggestions & Class Exchange */}
        <div className="space-y-4">
          {/* Replacement Class Suggestion Card */}
          {replacementStatus !== 'declined' && (
            <div className="bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl p-4 space-y-3 shadow-xs">
              <div className="flex items-center justify-between border-b border-[#E5E2D9] dark:border-zinc-800 pb-2.5">
                <span className="text-xs font-bold font-serif text-stone-900 dark:text-zinc-100">
                  Replacement class suggested
                </span>
                {replacementStatus === 'confirmed' ? (
                  <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 rounded border border-emerald-300 dark:border-emerald-800">
                    Confirmed
                  </span>
                ) : (
                  <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" title="Active suggestion" />
                )}
              </div>

              {replacementStatus === 'confirmed' ? (
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 rounded-lg space-y-1 text-xs">
                  <div className="font-bold text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>Class confirmed and added to timetable!</span>
                  </div>
                  <p className="text-stone-600 dark:text-zinc-400 leading-relaxed text-[11px] pt-1">
                    Thursday 11:00 AM – 12:00 PM (Room 204) has been scheduled. All 52 students have received an email notification.
                  </p>
                </div>
              ) : (
                <>
                  <div>
                    <h4 className="font-bold font-serif text-sm text-stone-900 dark:text-zinc-100">
                      Replacement for DBMS class (CSE-A)
                    </h4>
                    <p className="text-xs text-stone-600 dark:text-zinc-400 mt-1 leading-relaxed">
                      Your Monday class was cancelled. 47 of 52 students are free at the time below.
                    </p>
                  </div>

                  <div className="bg-white dark:bg-zinc-950 border border-[#E5E2D9] dark:border-zinc-800 rounded-lg p-3 space-y-1.5 text-xs shadow-2xs">
                    <div className="flex items-center justify-between">
                      <span className="text-stone-500 dark:text-zinc-400 font-medium">Suggested time:</span>
                      <span className="font-semibold text-emerald-700 dark:text-emerald-400">Best time for students</span>
                    </div>
                    <div className="font-bold text-stone-900 dark:text-zinc-100">
                      Thursday 11:00 AM – 12:00 PM (Room 204)
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={handleAcceptReplacement}
                      className="flex-1 py-2 bg-[#8C1B2E] hover:bg-[#721525] active:bg-[#5a111e] text-white rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 shadow-2xs"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Confirm this time</span>
                    </button>

                    <button
                      onClick={() => setShowDeclineModal(true)}
                      className="px-3.5 py-2 bg-white dark:bg-zinc-800 hover:bg-stone-50 dark:hover:bg-zinc-700 text-stone-700 dark:text-zinc-300 rounded-lg text-xs font-medium border border-[#E5E2D9] dark:border-zinc-700 transition-colors shadow-2xs"
                    >
                      Decline
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Classes You Can Take Over Card */}
          <div className="bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl p-4 space-y-3 text-xs shadow-xs">
            <div className="border-b border-[#E5E2D9] dark:border-zinc-800 pb-2">
              <h4 className="font-bold font-serif text-stone-900 dark:text-zinc-100 text-xs">
                Classes you can take over (optional)
              </h4>
              <p className="text-[11px] text-stone-500 dark:text-zinc-400 mt-0.5">
                Extra tutorial classes available if you wish to take them.
              </p>
            </div>

            <div className="space-y-2.5">
              {/* Item 1 */}
              <div className="p-3 bg-white dark:bg-zinc-950/60 border border-[#E5E2D9] dark:border-zinc-800 rounded-lg flex items-center justify-between gap-2 shadow-2xs">
                <div>
                  <div className="font-bold text-stone-900 dark:text-zinc-100">CS501 Tutorial (CSE-B)</div>
                  <div className="text-[11px] text-stone-500 dark:text-zinc-400 mt-0.5">Friday 10:00 AM – 11:00 AM · Room 104</div>
                </div>

                {claimedSlots['slot1'] ? (
                  <span className="px-2.5 py-1 bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 rounded text-xs font-bold border border-emerald-200 dark:border-emerald-800 flex items-center gap-1">
                    <Check className="h-3 w-3" /> Class Added
                  </span>
                ) : (
                  <button
                    onClick={() => handleClaimSlot('slot1', 'CS501', 'CSE-B', 'Friday', 'ts-3', 'Room 104')}
                    className="px-3 py-1.5 bg-[#8C1B2E] hover:bg-[#721525] text-white rounded-lg text-xs font-semibold transition-colors shrink-0 shadow-2xs"
                  >
                    Take this class
                  </button>
                )}
              </div>

              {/* Item 2 */}
              <div className="p-3 bg-white dark:bg-zinc-950/60 border border-[#E5E2D9] dark:border-zinc-800 rounded-lg flex items-center justify-between gap-2 shadow-2xs">
                <div>
                  <div className="font-bold text-stone-900 dark:text-zinc-100">Project Practical (CSE-C)</div>
                  <div className="text-[11px] text-stone-500 dark:text-zinc-400 mt-0.5">Wednesday 3:00 PM – 4:00 PM · Lab 301</div>
                </div>

                {claimedSlots['slot2'] ? (
                  <span className="px-2.5 py-1 bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 rounded text-xs font-bold border border-emerald-200 dark:border-emerald-800 flex items-center gap-1">
                    <Check className="h-3 w-3" /> Class Added
                  </span>
                ) : (
                  <button
                    onClick={() => handleClaimSlot('slot2', 'CS501', 'CSE-C', 'Wednesday', 'ts-8', 'Lab 301')}
                    className="px-3 py-1.5 bg-[#8C1B2E] hover:bg-[#721525] text-white rounded-lg text-xs font-semibold transition-colors shrink-0 shadow-2xs"
                  >
                    Take this class
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Decline Suggestion Reason Modal */}
      {showDeclineModal && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-black/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <h4 className="text-base font-bold text-slate-900 dark:text-zinc-100">
              Why are you declining this suggested class time?
            </h4>
            <p className="text-xs text-slate-600 dark:text-zinc-400 leading-relaxed">
              Please provide a short reason so we can suggest a better time for your replacement class.
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300">Reason</label>
              <input
                type="text"
                placeholder="e.g. Schedule conflict, Lab busy, Personal appointment"
                value={declineReason}
                onChange={e => setDeclineReason(e.target.value)}
                className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-xl p-2.5 text-xs text-slate-900 dark:text-white outline-none focus:border-red-600"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                onClick={() => setShowDeclineModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white"
              >
                Go back
              </button>
              <button
                onClick={handleConfirmDecline}
                className="px-4 py-2 bg-red-700 hover:bg-red-800 text-white rounded-xl text-xs font-bold transition-colors"
              >
                Decline suggestion
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Class Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-black/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <h4 className="text-base font-bold text-slate-900 dark:text-zinc-100">
              Cancel this class
            </h4>
            <p className="text-xs text-slate-600 dark:text-zinc-400 leading-relaxed">
              Students will be notified, and we will suggest a replacement class time.
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300">Why are you cancelling?</label>
              <input
                type="text"
                placeholder="e.g. Medical leave, Official meeting"
                value={cancellationReason}
                onChange={e => setCancellationReason(e.target.value)}
                className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-xl p-2.5 text-xs text-slate-900 dark:text-white outline-none focus:border-red-600"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                onClick={() => setShowCancelModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white"
              >
                Go back
              </button>
              <button
                onClick={handleExecuteCancel}
                className="px-4 py-2 bg-red-700 hover:bg-red-800 text-white rounded-xl text-xs font-bold transition-colors"
              >
                Yes, cancel class
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
