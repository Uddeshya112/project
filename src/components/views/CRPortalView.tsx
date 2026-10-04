import React, { useState } from 'react';
import { useTimetable } from '../../context/TimetableContext';
import { TIME_SLOTS } from '../../lib/initialData';
import { DayOfWeek } from '../../types';
import {
  Users,
  Calendar,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Vote,
  ThumbsUp,
  FileQuestion,
  Send,
  Plus,
  Building,
  UserCheck
} from 'lucide-react';

export function CRPortalView() {
  const {
    sections,
    selectedSectionId,
    setSelectedSectionId,
    sessions,
    courses,
    facultyMembers,
    rooms,
    polls,
    votePoll,
    requestStudentMakeup,
  } = useTimetable();

  const currentSection = sections.find(s => s.id === selectedSectionId) || sections[0];
  const [selectedDay, setSelectedDay] = useState<DayOfWeek>('Monday');
  const [makeupRequested, setMakeupRequested] = useState(false);
  const [showPollModal, setShowPollModal] = useState(false);
  const [newPollCourse, setNewPollCourse] = useState('CS501');
  const [newPollProposedSlot, setNewPollProposedSlot] = useState('Thursday 11:00 AM – 12:00 PM');
  const [pollCreatedSuccess, setPollCreatedSuccess] = useState(false);

  const days: DayOfWeek[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

  const sectionSessions = sessions.filter(
    s => s.sectionId === currentSection.id && s.day === selectedDay
  );

  const activePoll = polls[0];

  const handleRequest = () => {
    requestStudentMakeup('CS501', currentSection.id);
    setMakeupRequested(true);
  };

  const handleCreatePoll = (e: React.FormEvent) => {
    e.preventDefault();
    setPollCreatedSuccess(true);
    setTimeout(() => {
      setShowPollModal(false);
      setPollCreatedSuccess(false);
    }, 1200);
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E5E2D9] dark:border-zinc-800 pb-4">
        <div>
          <div className="flex items-center gap-2 text-[#8C1B2E] dark:text-red-400 text-xs font-semibold tracking-wider mb-0.5">
            <Users className="h-4 w-4" />
            <span>Class Representative Portal</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-serif font-bold text-stone-900 dark:text-zinc-100 tracking-tight">
            Section {currentSection.name}
          </h1>
          <p className="text-xs text-stone-600 dark:text-zinc-400 mt-0.5">
            {currentSection.program} · Semester {currentSection.semester} · {currentSection.studentCount} Students
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setShowPollModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-[#FAF9F5] dark:bg-zinc-900 hover:bg-stone-100 dark:hover:bg-zinc-800 text-stone-800 dark:text-zinc-200 border border-[#E5E2D9] dark:border-zinc-800 rounded-lg text-xs font-semibold shadow-xs transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span>New Class Poll</span>
          </button>

          <button
            onClick={handleRequest}
            disabled={makeupRequested}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#8C1B2E] hover:bg-[#731625] text-white rounded-lg text-xs font-semibold shadow-xs transition-all disabled:opacity-60"
          >
            <Send className="h-3.5 w-3.5" />
            <span>{makeupRequested ? 'Request Submitted' : 'Request Replacement Class'}</span>
          </button>
        </div>
      </div>

      {/* Cohort Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 bg-[#FAF9F5] dark:bg-zinc-900/50 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl space-y-1 shadow-xs">
          <div className="text-xs text-stone-500 dark:text-zinc-400 font-medium">Students in Section</div>
          <div className="text-2xl font-serif font-bold text-stone-900 dark:text-zinc-100">
            {currentSection.studentCount}
          </div>
          <div className="text-[11px] text-stone-500 dark:text-zinc-400">Section {currentSection.name}</div>
        </div>

        <div className="p-4 bg-[#FAF9F5] dark:bg-zinc-900/50 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl space-y-1 shadow-xs">
          <div className="text-xs text-stone-500 dark:text-zinc-400 font-medium">Average Attendance</div>
          <div className="text-2xl font-serif font-bold text-emerald-700 dark:text-emerald-400">
            90.4%
          </div>
          <div className="text-[11px] text-emerald-700 dark:text-emerald-400 flex items-center gap-1 font-medium">
            <CheckCircle2 className="h-3.5 w-3.5" /> Normal
          </div>
        </div>

        <div className="p-4 bg-[#FAF9F5] dark:bg-zinc-900/50 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl space-y-1 shadow-xs">
          <div className="text-xs text-stone-500 dark:text-zinc-400 font-medium">Pending Replacement Class</div>
          <div className="text-2xl font-serif font-bold text-amber-700 dark:text-amber-400">
            1 Class
          </div>
          <div className="text-[11px] text-stone-500 dark:text-zinc-400">DBMS (CS501)</div>
        </div>
      </div>

      {/* Section Daily Schedule */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-3">
          <div className="bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl overflow-hidden shadow-xs">
            {/* Day Switcher */}
            <div className="p-3.5 border-b border-[#E5E2D9] dark:border-zinc-800 flex items-center justify-between bg-white dark:bg-zinc-950/50">
              <div className="text-xs font-bold text-stone-900 dark:text-zinc-100 flex items-center gap-2">
                <Calendar className="h-4 w-4 text-stone-500 dark:text-zinc-400" />
                <span>Class Schedule for {selectedDay}</span>
              </div>

              <div className="flex bg-[#F7F6F2] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 p-0.5 rounded-lg text-xs">
                {days.map(d => (
                  <button
                    key={d}
                    onClick={() => setSelectedDay(d)}
                    className={`px-2.5 py-1 rounded-md transition-colors ${
                      selectedDay === d
                        ? 'bg-[#8C1B2E] text-white font-semibold shadow-xs'
                        : 'text-stone-700 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-200'
                    }`}
                  >
                    {d.slice(0, 3)}
                  </button>
                ))}
              </div>
            </div>

            {/* Schedule Items */}
            <div className="divide-y divide-[#E5E2D9] dark:divide-zinc-800/80">
              {TIME_SLOTS.map(slot => {
                const isLunch = slot.id === 'ts-5';
                const session = sectionSessions.find(s => s.timeSlotId === slot.id);

                if (isLunch) {
                  return (
                    <div key={slot.id} className="p-3 bg-stone-100/70 dark:bg-zinc-950/40 flex items-center justify-between text-xs text-stone-500 dark:text-zinc-500">
                      <span className="font-medium">{slot.startTime} – {slot.endTime}</span>
                      <span className="font-medium text-stone-700 dark:text-zinc-300">Lunch Break</span>
                      <span className="text-[11px] text-stone-400">No classes</span>
                    </div>
                  );
                }

                return (
                  <div
                    key={slot.id}
                    className={`p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs transition-colors ${
                      session?.status === 'Cancelled'
                        ? 'bg-red-50 dark:bg-red-950/20'
                        : session?.type === 'Makeup'
                        ? 'bg-emerald-50 dark:bg-emerald-950/20'
                        : 'hover:bg-white dark:hover:bg-zinc-800/50'
                    }`}
                  >
                    <div className="flex items-center gap-2 text-stone-600 dark:text-zinc-400 w-36 shrink-0 font-medium">
                      <Clock className="h-3.5 w-3.5 text-stone-400" />
                      <span>{slot.startTime} – {slot.endTime}</span>
                    </div>

                    <div className="flex-1">
                      {session ? (
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-bold text-stone-900 dark:text-zinc-100 flex items-center gap-2">
                              <span className="text-[#8C1B2E] dark:text-red-400 font-mono">{courses.find(c => c.id === session.courseId)?.code}</span>
                              <span>·</span>
                              <span>{courses.find(c => c.id === session.courseId)?.name}</span>
                              {session.status === 'Cancelled' && (
                                <span className="text-[10px] px-2 py-0.5 rounded bg-red-100 dark:bg-red-950 text-[#8C1B2E] dark:text-red-300 border border-red-200 dark:border-red-800/60 font-semibold">
                                  Cancelled
                                </span>
                              )}
                              {session.type === 'Makeup' && (
                                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 font-semibold">
                                  Replacement Class
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-stone-500 dark:text-zinc-400 mt-0.5 flex items-center gap-2">
                              <span>{facultyMembers.find(f => f.id === session.facultyId)?.name}</span>
                              <span>·</span>
                              <span>Room: {rooms.find(r => r.id === session.roomId)?.name || 'LT101'}</span>
                            </div>
                          </div>
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
        </div>

        {/* Right Column: Class Voting */}
        <div className="space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Vote className="h-4 w-4 text-stone-600 dark:text-zinc-400" />
                <h2 className="text-sm font-serif font-bold text-stone-900 dark:text-zinc-200">
                  Active Class Poll
                </h2>
              </div>
            </div>

            {activePoll && (
              <div className="p-4 bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl space-y-3 text-xs shadow-xs">
                <div>
                  <div className="font-bold text-stone-900 dark:text-zinc-100">
                    {courses.find(c => c.id === activePoll.courseId)?.code} Replacement Class
                  </div>
                  <p className="text-[11px] text-stone-600 dark:text-zinc-400 mt-1 leading-relaxed">
                    {activePoll.question}
                  </p>
                </div>

                <div className="space-y-2.5">
                  <div className="flex justify-between text-[11px] text-stone-500 dark:text-zinc-400">
                    <span>Votes received ({activePoll.votedStudentsCount}/{currentSection.studentCount}):</span>
                  </div>

                  <div className="space-y-2">
                    {activePoll.options.map(opt => {
                      const totalVotes = activePoll.options.reduce((sum, o) => sum + o.votes, 0) || 1;
                      const percentage = Math.round((opt.votes / totalVotes) * 100);
                      const isSelected = activePoll.userVotedOptionId === opt.id;
                      return (
                        <div key={opt.id} className="p-2.5 bg-white dark:bg-zinc-950 border border-[#E5E2D9] dark:border-zinc-800 rounded-lg space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-stone-900 dark:text-zinc-200 font-bold">{opt.timeSlotLabel} {opt.isSystemRecommended && <span className="text-emerald-800 dark:text-emerald-400 text-[10px] bg-emerald-50 dark:bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-800/50 font-semibold ml-1">Best time</span>}</span>
                            <span className="text-stone-500 dark:text-zinc-400">{opt.votes} votes ({percentage}%)</span>
                          </div>
                          <div className="h-1.5 bg-stone-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-600 dark:bg-emerald-500 rounded-full" style={{ width: `${percentage}%` }} />
                          </div>
                          <button
                            onClick={() => votePoll(activePoll.id, opt.id)}
                            disabled={activePoll.userHasVoted}
                            className={`w-full mt-1 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${
                              isSelected
                                ? 'bg-emerald-700 text-white'
                                : 'bg-stone-100 dark:bg-zinc-800 hover:bg-stone-200 dark:hover:bg-zinc-700 text-stone-800 dark:text-zinc-200 disabled:opacity-50'
                            }`}
                          >
                            <ThumbsUp className="h-3.5 w-3.5" />
                            <span>{isSelected ? 'Your Vote' : 'Vote for this time'}</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* New Poll Modal */}
      {showPollModal && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl max-w-md w-full p-5 space-y-4 shadow-xl">
            <h4 className="text-base font-serif font-bold text-stone-900 dark:text-zinc-100">Create new class vote poll</h4>
            <p className="text-xs text-stone-600 dark:text-zinc-400 leading-relaxed">
              Ask your section members which time works best for a replacement class.
            </p>

            <form onSubmit={handleCreatePoll} className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="text-stone-700 dark:text-zinc-300 font-medium">Course</label>
                <select
                  value={newPollCourse}
                  onChange={e => setNewPollCourse(e.target.value)}
                  className="w-full bg-white dark:bg-zinc-950 border border-[#E5E2D9] dark:border-zinc-800 rounded-lg p-2.5 text-stone-900 dark:text-zinc-200 outline-none focus:border-[#8C1B2E]"
                >
                  {courses.map(c => (
                    <option key={c.id} value={c.code}>{c.code} – {c.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-stone-700 dark:text-zinc-300 font-medium">Suggested Day & Time</label>
                <input
                  type="text"
                  value={newPollProposedSlot}
                  onChange={e => setNewPollProposedSlot(e.target.value)}
                  className="w-full bg-white dark:bg-zinc-950 border border-[#E5E2D9] dark:border-zinc-800 rounded-lg p-2.5 text-stone-900 dark:text-zinc-200 outline-none focus:border-[#8C1B2E]"
                  placeholder="e.g. Friday 10:00 AM – 11:00 AM"
                />
              </div>

              {pollCreatedSuccess && (
                <div className="text-emerald-700 dark:text-emerald-400 text-xs font-semibold py-1">
                  Poll published to Section {currentSection.name}!
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPollModal(false)}
                  className="px-4 py-2 rounded-lg text-stone-600 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-white font-medium"
                >
                  Go back
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#8C1B2E] hover:bg-[#731625] text-white rounded-lg font-semibold transition-colors shadow-xs"
                >
                  Publish Poll
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
