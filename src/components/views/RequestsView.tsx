import React, { useState } from 'react';
import { useTimetable } from '../../context/TimetableContext';
import {
  FileText,
  Check,
  X,
  Clock,
  User,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Filter,
  RefreshCw,
  Building,
  Calendar
} from 'lucide-react';

export interface AcademicRequest {
  id: string;
  type: 'Cancellation' | 'Makeup Class' | 'Faculty Swap' | 'Room Change' | 'Change Request';
  courseCode: string;
  sectionName: string;
  slotDetail: string;
  requestedBy: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  timestamp: string;
  details?: string;
}

export function RequestsView() {
  const {
    makeupTasks,
    courses,
    sections,
    facultyMembers,
    scheduleMakeup,
  } = useTimetable();

  const [filter, setFilter] = useState<'All' | 'Pending' | 'Approved' | 'Rejected'>('All');

  // Initial Requests List constructed from real makeup tasks & pending requests
  const [requests, setRequests] = useState<AcademicRequest[]>([
    {
      id: 'req-1',
      type: 'Cancellation',
      courseCode: 'CS501',
      sectionName: 'CSE-A',
      slotDetail: 'Monday 08:00–08:50 (Room 204)',
      requestedBy: 'Dr. Arvind Sharma',
      status: 'Pending',
      timestamp: 'Today, 07:30 AM',
      details: 'Department meeting & research review conflict',
    },
    {
      id: 'req-2',
      type: 'Faculty Swap',
      courseCode: 'CS502',
      sectionName: 'CSE-B',
      slotDetail: 'Tuesday 11:00–11:50 · Dr. Sharma → Prof. Sunita Gupta',
      requestedBy: 'Dr. Arvind Sharma',
      status: 'Pending',
      timestamp: 'Today, 08:15 AM',
      details: 'Guest lecture scheduling overlap',
    },
    {
      id: 'req-3',
      type: 'Makeup Class',
      courseCode: 'CS503',
      sectionName: 'CSE-A',
      slotDetail: 'Thursday 11:00–11:50 (Lab 1)',
      requestedBy: 'Prof. Rajesh Kumar',
      status: 'Approved',
      timestamp: 'Yesterday, 04:20 PM',
      details: 'Syllabus catch-up session scheduled',
    },
    {
      id: 'req-4',
      type: 'Room Change',
      courseCode: 'CS501',
      sectionName: 'CSE-C',
      slotDetail: 'Wednesday 10:00–10:50 · Room 201 → Room 204',
      requestedBy: 'Dr. Meenakshi Dutt',
      status: 'Pending',
      timestamp: 'Yesterday, 02:10 PM',
      details: 'Projector equipment requirement',
    },
    {
      id: 'req-5',
      type: 'Change Request',
      courseCode: 'CS504',
      sectionName: 'CSE-A (Group A1)',
      slotDetail: 'Friday 14:00–15:40 Lab Slot Adjustment',
      requestedBy: 'Student Representative (CSE-A)',
      status: 'Rejected',
      timestamp: 'Oct 03, 2026',
      details: 'Clashes with core elective lecture',
    },
  ]);

  const handleApprove = (id: string) => {
    setRequests(prev =>
      prev.map(r => (r.id === id ? { ...r, status: 'Approved' } : r))
    );
  };

  const handleReject = (id: string) => {
    setRequests(prev =>
      prev.map(r => (r.id === id ? { ...r, status: 'Rejected' } : r))
    );
  };

  const filteredRequests = requests.filter(r => {
    if (filter === 'All') return true;
    return r.status === filter;
  });

  return (
    <div className="max-w-5xl mx-auto space-y-6 font-sans pb-12">
      {/* Header */}
      <div className="border-b border-[#E5E2D9] dark:border-zinc-800 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-serif font-bold text-stone-900 dark:text-zinc-100 tracking-tight">
            Requests
          </h1>
          <p className="text-xs sm:text-sm text-stone-500 dark:text-zinc-400 mt-1">
            Review and approve class cancellations, faculty swaps, makeup sessions, and room changes.
          </p>
        </div>

        {/* Status Filter Segmented Controls */}
        <div className="flex bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 p-1 rounded-xl text-xs font-semibold">
          <button
            onClick={() => setFilter('All')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              filter === 'All'
                ? 'bg-[#8C1B2E] text-white shadow-xs'
                : 'text-stone-600 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-100'
            }`}
          >
            All ({requests.length})
          </button>
          <button
            onClick={() => setFilter('Pending')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              filter === 'Pending'
                ? 'bg-[#8C1B2E] text-white shadow-xs'
                : 'text-stone-600 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-100'
            }`}
          >
            Pending ({requests.filter(r => r.status === 'Pending').length})
          </button>
          <button
            onClick={() => setFilter('Approved')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              filter === 'Approved'
                ? 'bg-[#8C1B2E] text-white shadow-xs'
                : 'text-stone-600 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-100'
            }`}
          >
            Approved
          </button>
          <button
            onClick={() => setFilter('Rejected')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              filter === 'Rejected'
                ? 'bg-[#8C1B2E] text-white shadow-xs'
                : 'text-stone-600 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-100'
            }`}
          >
            Rejected
          </button>
        </div>
      </div>

      {/* Requests List */}
      <div className="space-y-3">
        {filteredRequests.length === 0 ? (
          <div className="p-8 bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl text-center space-y-2">
            <CheckCircle2 className="h-8 w-8 text-emerald-600 mx-auto" />
            <div className="text-sm font-bold text-stone-900 dark:text-zinc-100">No {filter} Requests</div>
            <p className="text-xs text-stone-500">All academic schedule requests have been addressed.</p>
          </div>
        ) : (
          filteredRequests.map(req => (
            <div
              key={req.id}
              className="bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs hover:border-stone-400 transition-colors"
            >
              <div className="space-y-1.5 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-stone-900 dark:text-zinc-100 text-sm font-serif">
                    {req.type}
                  </span>
                  <span className="text-stone-400">·</span>
                  <span className="font-mono font-bold text-[#8C1B2E] dark:text-red-400">
                    {req.courseCode} ({req.sectionName})
                  </span>
                  <span className="text-stone-400">·</span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                      req.status === 'Approved'
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300'
                        : req.status === 'Rejected'
                        ? 'bg-rose-50 text-rose-800 border border-rose-200 dark:bg-red-950/40 dark:text-red-300'
                        : 'bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300'
                    }`}
                  >
                    {req.status}
                  </span>
                </div>

                <div className="text-stone-700 dark:text-zinc-300 font-medium">
                  {req.slotDetail}
                </div>

                <div className="text-[11px] text-stone-500 dark:text-zinc-400 flex items-center gap-3">
                  <span>Requested by: <strong>{req.requestedBy}</strong></span>
                  <span>·</span>
                  <span>{req.timestamp}</span>
                </div>

                {req.details && (
                  <div className="text-[11px] text-stone-500 italic pt-0.5">
                    "{req.details}"
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              {req.status === 'Pending' ? (
                <div className="flex items-center gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-[#E5E2D9] dark:border-zinc-800">
                  <button
                    onClick={() => handleReject(req.id)}
                    className="px-3.5 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900/50 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/30 text-rose-800 dark:text-rose-300 text-xs font-semibold transition-colors flex items-center gap-1"
                  >
                    <X className="h-3.5 w-3.5" />
                    <span>Reject</span>
                  </button>

                  <button
                    onClick={() => handleApprove(req.id)}
                    className="px-4 py-1.5 rounded-lg bg-[#8C1B2E] hover:bg-[#721525] text-white text-xs font-semibold transition-colors shadow-xs flex items-center gap-1"
                  >
                    <Check className="h-3.5 w-3.5" />
                    <span>Approve</span>
                  </button>
                </div>
              ) : (
                <div className="text-xs text-stone-400 font-medium shrink-0">
                  Decision Recorded
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
