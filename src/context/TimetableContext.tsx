import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type {
  ClassSession,
  Room,
  Faculty,
  StudentSection,
  SubSection,
  Course,
  CourseAllocation,
  AcademicConstraint,
  AcademicYearConfig,
  Department,
  Program,
  ValidationReport,
  TimetablePublishStatus,
  MakeupTask,
  RecoveryOpportunity,
  StudentPoll,
  NotificationItem,
  AuditLog,
  SystemHealthMetrics,
  TimetableVersion,
  DayOfWeek,
  WhatIfSimulation,
  GenerationResponse,
  GenerationRoutine,
} from '../types';
import { INITIAL_ACADEMIC_YEAR, INITIAL_WHAT_IF_SIMULATION } from '../lib/initialData';
import { calculateHealthScore } from '../lib/recoveryEngine';
import { validateAcademicSetup } from '../lib/timetableGenerator';
import type { ExcelImportPreview } from '../lib/excelMasterService';
import { api } from '../lib/api';
import { useAuth } from './AuthContext';

export type UserRole = 'Coordinator' | 'Faculty' | 'Student' | 'HOD' | 'Admin';
export type ViewTab =
  | 'overview'
  | 'academic_setup'
  | 'academic_year'
  | 'departments'
  | 'programs'
  | 'courses_mgmt'
  | 'faculty_mgmt'
  | 'rooms_mgmt'
  | 'sections_mgmt'
  | 'allocations'
  | 'availability'
  | 'constraints'
  | 'generation_validator'
  | 'timetable_review'
  | 'grid'
  | 'recovery'
  | 'whatif'
  | 'solvers'
  | 'syllabus'
  | 'faculty_portal'
  | 'student_portal'
  | 'student_courses'
  | 'student_section'
  | 'governance'
  | 'auth_gov'
  | 'settings'
  | 'profile';

/** Every server action resolves to this; failures are also shown as a toast. */
export interface ActionResult<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
}

export interface Notice {
  id: number;
  type: 'success' | 'error';
  message: string;
}

interface ServerState {
  academicYear: AcademicYearConfig;
  departments: Department[];
  programs: Program[];
  rooms: Room[];
  facultyMembers: Faculty[];
  sections: StudentSection[];
  courses: Course[];
  allocations: CourseAllocation[];
  constraints: AcademicConstraint[];
  publishStatus: TimetablePublishStatus;
  sessions: ClassSession[];
  publishedSessions: ClassSession[];
  activeVersionNumber: number | null;
  publishedVersionNumber: number | null;
  makeupTasks: MakeupTask[];
  recoveryOpportunities: RecoveryOpportunity[];
  polls: StudentPoll[];
  notifications: NotificationItem[];
  versions: TimetableVersion[];
  auditLogs: AuditLog[];
  studentsCount: number;
}

const EMPTY: ServerState = {
  academicYear: INITIAL_ACADEMIC_YEAR,
  departments: [],
  programs: [],
  rooms: [],
  facultyMembers: [],
  sections: [],
  courses: [],
  allocations: [],
  constraints: [],
  publishStatus: 'Draft',
  sessions: [],
  publishedSessions: [],
  activeVersionNumber: null,
  publishedVersionNumber: null,
  makeupTasks: [],
  recoveryOpportunities: [],
  polls: [],
  notifications: [],
  versions: [],
  auditLogs: [],
  studentsCount: 0,
};

type GroupParams = {
  programName: string;
  batchYear: number;
  totalStudents: number;
  numGroups: number;
  namingPattern: string;
  numSubgroupsPerGroup: number;
  subgroupNamingPattern?: string;
  departmentId?: string;
};

interface TimetableContextType extends ServerState {
  isLoading: boolean;
  loadError: string | null;
  refresh: () => Promise<void>;
  notice: Notice | null;
  dismissNotice: () => void;

  validationReport: ValidationReport;
  health: SystemHealthMetrics;
  whatIfSimulation: WhatIfSimulation;

  // View state
  currentRole: UserRole;
  setCurrentRole: (role: UserRole) => void;
  activeView: ViewTab;
  setActiveView: (view: ViewTab) => void;
  selectedFacultyId: string;
  setSelectedFacultyId: (id: string) => void;
  selectedSectionId: string;
  setSelectedSectionId: (id: string) => void;
  selectedRoomId: string;
  setSelectedRoomId: (id: string) => void;

  // Master data
  updateAcademicYear: (updates: Partial<AcademicYearConfig>) => Promise<ActionResult>;
  addDepartment: (dept: Omit<Department, 'id'>) => Promise<ActionResult>;
  updateDepartment: (id: string, updates: Partial<Department>) => Promise<ActionResult>;
  deleteDepartment: (id: string) => Promise<ActionResult>;
  toggleDepartmentStatus: (id: string) => Promise<ActionResult>;
  addProgram: (prog: Omit<Program, 'id'>) => Promise<ActionResult>;
  updateProgram: (id: string, updates: Partial<Program>) => Promise<ActionResult>;
  deleteProgram: (id: string) => Promise<ActionResult>;
  addRoom: (room: Omit<Room, 'id'>) => Promise<ActionResult>;
  updateRoom: (id: string, updates: Partial<Room>) => Promise<ActionResult>;
  deleteRoom: (id: string) => Promise<ActionResult>;
  toggleRoomAvailability: (id: string) => Promise<ActionResult>;
  addFaculty: (fac: Omit<Faculty, 'id'>) => Promise<ActionResult>;
  updateFaculty: (id: string, updates: Partial<Faculty>) => Promise<ActionResult>;
  deleteFaculty: (id: string) => Promise<ActionResult>;
  toggleFacultyStatus: (id: string) => Promise<ActionResult>;
  setFacultyProtectedSlot: (facultyId: string, day: DayOfWeek, periodId: string, reason: 'Research' | 'Lunch' | 'Personal' | 'Department' | 'Meeting') => Promise<ActionResult>;
  addSection: (sec: Omit<StudentSection, 'id'>) => Promise<ActionResult>;
  updateSection: (id: string, updates: Partial<StudentSection>) => Promise<ActionResult>;
  deleteSection: (id: string) => Promise<ActionResult>;
  addSubSection: (sectionId: string, subSec: Omit<SubSection, 'id' | 'sectionId'>) => Promise<ActionResult>;
  deleteSubSection: (sectionId: string, subSecId: string) => Promise<ActionResult>;
  addCourse: (course: Omit<Course, 'id'>) => Promise<ActionResult>;
  updateCourse: (id: string, updates: Partial<Course>) => Promise<ActionResult>;
  deleteCourse: (id: string) => Promise<ActionResult>;
  toggleCourseStatus: (id: string) => Promise<ActionResult>;
  addAllocation: (alloc: Omit<CourseAllocation, 'id' | 'status'>) => Promise<ActionResult>;
  updateAllocation: (id: string, updates: Partial<CourseAllocation>) => Promise<ActionResult>;
  deleteAllocation: (id: string) => Promise<ActionResult>;
  toggleConstraint: (id: string) => Promise<ActionResult>;
  bulkGenerateGroups: (params: GroupParams) => Promise<ActionResult<StudentSection[]>>;
  commitMasterImport: (parsedData: ExcelImportPreview['parsedData'], mode?: 'upsert' | 'replace') => Promise<{ success: boolean; importedCount: number; message: string }>;

  // Validation & generation
  runValidation: () => ValidationReport;
  generateDraftTimetable: () => Promise<{ isSuccess: boolean; sessionsGenerated: number; conflicts: string[]; scheduledHours: number; totalHours: number }>;
  generateDualRoutinesAPI: () => Promise<GenerationResponse>;
  selectRoutineAPI: (versionNumber: number) => Promise<ActionResult>;
  latestGeneratedRoutines: GenerationRoutine[] | null;
  updatePublishStatus: (status: TimetablePublishStatus) => Promise<ActionResult>;
  publishMasterTimetable: () => Promise<{ success: boolean; error?: string }>;
  moveSessionWithValidation: (sessionId: string, targetDay: DayOfWeek, targetTimeSlotId: string, targetRoomId: string, reason?: string) => Promise<{ success: boolean; error?: string }>;
  swapSessionsWithValidation: (sessionAId: string, sessionBId: string, reason?: string) => Promise<{ success: boolean; error?: string }>;
  restoreVersion: (versionNumber: number) => Promise<ActionResult>;
  addSession: (sessionData: Omit<ClassSession, 'id' | 'version'>) => Promise<{ isSuccess: boolean; error?: string }>;
  toggleSessionLock: (sessionId: string, reason?: string) => Promise<ActionResult>;

  // Operations
  cancelSession: (sessionId: string, reason: string) => Promise<ActionResult>;
  scheduleMakeup: (opportunityId: string) => Promise<ActionResult>;
  declineOpportunity: (opportunityId: string) => Promise<ActionResult>;
  votePoll: (pollId: string, optionId: string) => Promise<ActionResult>;
  markNotificationRead: (id: string) => Promise<ActionResult>;
  claimMarketplaceSlot: (courseId: string, sectionId: string, day: DayOfWeek, timeSlotId: string, roomId: string, type: string) => Promise<ActionResult>;
  requestSubstituteCover: (substituteFacultyId: string, courseId: string, sectionId: string, day: DayOfWeek, timeSlotId: string) => Promise<ActionResult>;
  requestStudentMakeup: (courseId: string, sectionId: string) => Promise<ActionResult>;
  applySimulation: (scenarioTitle?: string) => Promise<ActionResult>;
}

const TimetableContext = createContext<TimetableContextType | null>(null);

export function TimetableProvider({ children }: { children: React.ReactNode }) {
  const { roster, currentUser } = useAuth();
  const [state, setState] = useState<ServerState>(EMPTY);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [latestGeneratedRoutines, setLatestGeneratedRoutines] = useState<GenerationRoutine[] | null>(null);

  const [currentRole, setCurrentRole] = useState<UserRole>('Coordinator');
  const [activeView, setActiveView] = useState<ViewTab>('overview');
  const [selectedFacultyId, setSelectedFacultyId] = useState('');
  const [selectedSectionId, setSelectedSectionId] = useState('');
  const [selectedRoomId, setSelectedRoomId] = useState('');

  const refresh = useCallback(async () => {
    try {
      const data = await api<ServerState>('/api/academic/bootstrap');
      setState({ ...EMPTY, ...data });
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load timetable data.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh, currentUser?.id]);

  // Default selections: the signed-in user's own faculty record / section, else the first item.
  useEffect(() => {
    if (!state.facultyMembers.some((f) => f.id === selectedFacultyId)) {
      setSelectedFacultyId(roster?.facultyId && state.facultyMembers.some((f) => f.id === roster.facultyId) ? roster.facultyId : state.facultyMembers[0]?.id ?? '');
    }
    if (!state.sections.some((s) => s.id === selectedSectionId)) {
      setSelectedSectionId(roster?.sectionId && state.sections.some((s) => s.id === roster.sectionId) ? roster.sectionId : state.sections[0]?.id ?? '');
    }
    if (!state.rooms.some((r) => r.id === selectedRoomId)) setSelectedRoomId(state.rooms[0]?.id ?? '');
  }, [state.facultyMembers, state.sections, state.rooms, roster, selectedFacultyId, selectedSectionId, selectedRoomId]);

  const toast = useCallback((type: Notice['type'], message: string) => setNotice({ id: Date.now(), type, message }), []);

  /** Calls the API, reloads server state on success, and reports the outcome. */
  const run = useCallback(
    async <T,>(path: string, method: string, body: unknown, successMessage?: string): Promise<ActionResult<T>> => {
      try {
        const data = await api<T>(path, { method, body });
        await refresh();
        if (successMessage) toast('success', successMessage);
        return { success: true, message: (data as any)?.message ?? successMessage, data };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Request failed.';
        toast('error', message);
        return { success: false, message };
      }
    },
    [refresh, toast],
  );

  const validationReport = useMemo(
    () =>
      validateAcademicSetup(state.academicYear, state.departments, state.programs, state.courses, state.facultyMembers, state.rooms, state.sections, state.allocations, state.constraints),
    [state.academicYear, state.departments, state.programs, state.courses, state.facultyMembers, state.rooms, state.sections, state.allocations, state.constraints],
  );
  const health = useMemo(
    () => calculateHealthScore(state.sessions, state.rooms, state.facultyMembers, state.sections, state.courses, state.academicYear),
    [state.sessions, state.rooms, state.facultyMembers, state.sections, state.courses, state.academicYear],
  );

  const actions = useMemo(() => {
    const crud = (route: string, label: string) => ({
      add: (body: object) => run(`/api/academic/${route}`, 'POST', body, `${label} added.`),
      update: (id: string, body: object) => run(`/api/academic/${route}/${encodeURIComponent(id)}`, 'PUT', body, `${label} updated.`),
      remove: (id: string) => run(`/api/academic/${route}/${encodeURIComponent(id)}`, 'DELETE', undefined, `${label} deleted.`),
    });
    const dept = crud('departments', 'Department');
    const prog = crud('programs', 'Program');
    const room = crud('rooms', 'Room');
    const fac = crud('faculty', 'Faculty member');
    const sec = crud('groups', 'Group');
    const course = crud('courses', 'Course');
    const alloc = crud('allocations', 'Allocation');
    const find = <V extends { id: string }>(list: V[], id: string) => list.find((x) => x.id === id);

    return {
      updateAcademicYear: (updates: Partial<AcademicYearConfig>) => run('/api/academic/year', 'PUT', updates, 'Academic year saved.'),
      addDepartment: dept.add,
      updateDepartment: dept.update,
      deleteDepartment: dept.remove,
      toggleDepartmentStatus: (id: string) => dept.update(id, { status: find(state.departments, id)?.status === 'Active' ? 'Inactive' : 'Active' }),
      addProgram: prog.add,
      updateProgram: prog.update,
      deleteProgram: prog.remove,
      addRoom: room.add,
      updateRoom: room.update,
      deleteRoom: room.remove,
      toggleRoomAvailability: (id: string) => room.update(id, { isAvailable: !find(state.rooms, id)?.isAvailable }),
      addFaculty: fac.add,
      updateFaculty: fac.update,
      deleteFaculty: fac.remove,
      toggleFacultyStatus: (id: string) => fac.update(id, { status: find(state.facultyMembers, id)?.status === 'Inactive' ? 'Active' : 'Inactive' }),
      setFacultyProtectedSlot: (facultyId: string, day: DayOfWeek, periodId: string, reason: 'Research' | 'Lunch' | 'Personal' | 'Department' | 'Meeting') =>
        run('/api/academic/faculty-protected-slot', 'POST', { facultyId, day, periodId, reason }, 'Availability updated.'),
      addSection: sec.add,
      updateSection: sec.update,
      deleteSection: sec.remove,
      addSubSection: (sectionId: string, sub: Omit<SubSection, 'id' | 'sectionId'>) =>
        run('/api/academic/subgroups', 'POST', { groupId: sectionId, ...sub }, 'Subgroup added.'),
      deleteSubSection: (sectionId: string, subId: string) =>
        run(`/api/academic/subgroups/${encodeURIComponent(sectionId)}/${encodeURIComponent(subId)}`, 'DELETE', undefined, 'Subgroup deleted.'),
      addCourse: course.add,
      updateCourse: course.update,
      deleteCourse: course.remove,
      toggleCourseStatus: (id: string) => course.update(id, { status: find(state.courses, id)?.status === 'Archived' ? 'Active' : 'Archived' }),
      addAllocation: alloc.add,
      updateAllocation: alloc.update,
      deleteAllocation: alloc.remove,
      toggleConstraint: (id: string) => run(`/api/academic/constraints/${encodeURIComponent(id)}/toggle`, 'POST', {}, 'Constraint updated.'),
      bulkGenerateGroups: async (params: GroupParams) => {
        const r = await run<{ sections: StudentSection[] }>('/api/academic/groups/bulk', 'POST', params, 'Groups generated.');
        return { ...r, data: r.data?.sections ?? [] };
      },
      commitMasterImport: async (parsedData: ExcelImportPreview['parsedData'], mode: 'upsert' | 'replace' = 'upsert') => {
        const r = await run<{ importedCount: number; message: string }>('/api/academic/import', 'POST', { parsedData, mode });
        if (r.success) toast('success', r.data?.message ?? 'Import complete.');
        return { success: r.success, importedCount: r.data?.importedCount ?? 0, message: r.data?.message ?? r.message ?? '' };
      },

      generateDualRoutinesAPI: async (): Promise<GenerationResponse> => {
        const r = await run<GenerationResponse>('/api/academic/generate', 'POST', {});
        if (!r.success || !r.data) return { success: false, isFeasible: false, routines: [], error: r.message };
        setLatestGeneratedRoutines(r.data.routines);
        toast(r.data.success ? 'success' : 'error', r.data.success ? 'Timetable routines generated and validated.' : 'No feasible timetable was found. See the diagnostics below.');
        return r.data;
      },
      selectRoutineAPI: (versionNumber: number) => run('/api/timetable/select-routine', 'POST', { versionNumber }, `Version ${versionNumber} is now the working draft.`),
      updatePublishStatus: (status: TimetablePublishStatus) => {
        if (status === 'Approved') return run('/api/timetable/approve', 'POST', {}, 'Timetable approved.');
        if (status === 'Published') return run('/api/timetable/publish', 'POST', {}, 'Timetable published.');
        return run('/api/timetable/status', 'POST', { status }, `Draft marked ${status}.`);
      },
      publishMasterTimetable: async () => {
        const r = await run('/api/timetable/publish', 'POST', {}, 'Timetable published to all students and faculty.');
        return { success: r.success, error: r.success ? undefined : r.message };
      },
      moveSessionWithValidation: async (sessionId: string, targetDay: DayOfWeek, targetTimeSlotId: string, targetRoomId: string, reason?: string) => {
        const r = await run('/api/timetable/move', 'POST', { sessionId, targetDay, targetTimeSlotId, targetRoomId, reason }, 'Session moved.');
        return { success: r.success, error: r.success ? undefined : r.message };
      },
      swapSessionsWithValidation: async (sessionAId: string, sessionBId: string, reason?: string) => {
        const r = await run('/api/timetable/swap', 'POST', { sessionAId, sessionBId, reason }, 'Sessions swapped.');
        return { success: r.success, error: r.success ? undefined : r.message };
      },
      restoreVersion: (versionNumber: number) =>
        run(`/api/timetable/versions/${versionNumber}/restore`, 'POST', {}, `Working draft restored to version ${versionNumber}.`),
      addSession: async (sessionData: Omit<ClassSession, 'id' | 'version'>) => {
        const r = await run('/api/timetable/sessions', 'POST', sessionData, 'Class added.');
        return { isSuccess: r.success, error: r.success ? undefined : r.message };
      },
      toggleSessionLock: (sessionId: string, reason?: string) =>
        run(`/api/timetable/sessions/${encodeURIComponent(sessionId)}/lock`, 'POST', { reason }, 'Lock updated.'),

      cancelSession: (sessionId: string, reason: string) => run('/api/recovery/cancel-class', 'POST', { sessionId, reason }, 'Class cancelled; make-up options generated.'),
      scheduleMakeup: (opportunityId: string) => run('/api/recovery/schedule-makeup', 'POST', { opportunityId }, 'Make-up class scheduled.'),
      declineOpportunity: (opportunityId: string) => run('/api/recovery/decline', 'POST', { opportunityId }, 'Option declined.'),
      votePoll: (pollId: string, optionId: string) => run('/api/voting/vote', 'POST', { pollId, optionId }, 'Vote recorded.'),
      markNotificationRead: (id: string) => run(`/api/notifications/${encodeURIComponent(id)}/read`, 'POST', {}),
      claimMarketplaceSlot: (courseId: string, sectionId: string, day: DayOfWeek, timeSlotId: string, roomId: string, type: string) =>
        run('/api/timetable/sessions', 'POST', { courseId, sectionId, day, timeSlotId, roomId, type }, 'Class added to your timetable.'),
      requestSubstituteCover: (substituteFacultyId: string, courseId: string, sectionId: string, day: DayOfWeek, timeSlotId: string) => {
        const sub = find(state.facultyMembers, substituteFacultyId);
        const c = find(state.courses, courseId);
        const s = find(state.sections, sectionId);
        const slot = state.academicYear.timeSlots.find((t) => t.id === timeSlotId)?.label ?? timeSlotId;
        return run('/api/notifications', 'POST', {
          type: 'makeup_request',
          title: `Substitute cover requested (${c?.code ?? courseId})`,
          message: `Request for ${sub?.name ?? 'a faculty member'} to cover ${s?.name ?? sectionId} on ${day} ${slot}.`,
          recipientRole: 'Faculty',
        }, 'Cover request sent.');
      },
      requestStudentMakeup: (courseId: string, sectionId: string) => {
        const c = find(state.courses, courseId);
        const s = find(state.sections, sectionId);
        return run('/api/notifications', 'POST', {
          type: 'makeup_request',
          title: `Make-up requested (${c?.code ?? courseId})`,
          message: `${s?.name ?? sectionId} class representative requests a make-up class for ${c?.name ?? courseId}.`,
          recipientRole: 'Coordinator',
          actionable: true,
        }, 'Request sent to the coordinator.');
      },
      applySimulation: (scenarioTitle?: string) =>
        run('/api/notifications', 'POST', {
          type: 'approval_needed',
          title: `What-if scenario for review: ${scenarioTitle ?? INITIAL_WHAT_IF_SIMULATION.title}`.slice(0, 120),
          message: 'A simulated scenario was submitted for coordinator review. No live timetable changes were made.',
          recipientRole: 'Coordinator',
        }, 'Scenario sent to the coordinator for review.'),
    };
  }, [run, toast, state]);

  const generateDraftTimetable = useCallback(async () => {
    const res = await actions.generateDualRoutinesAPI();
    const first = res.routines[0];
    const totalHours = state.allocations.reduce((n, a) => n + a.hoursPerWeek, 0);
    return {
      isSuccess: Boolean(res.success && first?.sessions.length),
      sessionsGenerated: first?.sessions.length ?? 0,
      conflicts: first?.validation.blockingReasons ?? (res.error ? [res.error] : []),
      scheduledHours: first?.sessions.length ?? 0,
      totalHours,
    };
  }, [actions, state.allocations]);

  const value = useMemo<TimetableContextType>(
    () => ({
      ...state,
      isLoading,
      loadError,
      refresh,
      notice,
      dismissNotice: () => setNotice(null),
      validationReport,
      health,
      whatIfSimulation: INITIAL_WHAT_IF_SIMULATION,
      currentRole,
      setCurrentRole,
      activeView,
      setActiveView,
      selectedFacultyId,
      setSelectedFacultyId,
      selectedSectionId,
      setSelectedSectionId,
      selectedRoomId,
      setSelectedRoomId,
      ...actions,
      runValidation: () => validationReport,
      generateDraftTimetable,
      latestGeneratedRoutines,
    }),
    [state, isLoading, loadError, refresh, notice, validationReport, health, currentRole, activeView, selectedFacultyId, selectedSectionId, selectedRoomId, actions, generateDraftTimetable, latestGeneratedRoutines],
  );

  return <TimetableContext.Provider value={value}>{children}</TimetableContext.Provider>;
}

export function useTimetable() {
  const context = useContext(TimetableContext);
  if (!context) throw new Error('useTimetable must be used within a TimetableProvider');
  return context;
}
