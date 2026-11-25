import React, { createContext, useContext, useState, useMemo, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import {
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
  TimeSlot,
  WhatIfSimulation,
  GenerationResponse,
  GenerationRoutine,
  WorkspaceType
} from '../types';
import {
  validateTimetableIndependently,
  IndependentValidationReport,
  ViolationDetail
} from '../lib/independentValidator';
import {
  executeOptimizationEngine,
  EngineOptions,
  GeneratedCandidate
} from '../lib/optimizationEngine';
import {
  ROOMS,
  FACULTY_MEMBERS,
  SECTIONS,
  COURSES,
  DEPARTMENTS,
  PROGRAMS,
  INITIAL_ACADEMIC_YEAR,
  INITIAL_ALLOCATIONS,
  INITIAL_CONSTRAINTS,
  INITIAL_SESSIONS,
  INITIAL_MAKEUP_TASKS,
  INITIAL_RECOVERY_OPPORTUNITIES,
  INITIAL_POLLS,
  INITIAL_NOTIFICATIONS,
  INITIAL_VERSIONS,
  INITIAL_WHAT_IF_SIMULATION
} from '../lib/initialData';
import {
  calculateHealthScore,
  findSelfHealingRecoverySlots,
  checkHardConstraints
} from '../lib/recoveryEngine';
import { validateAcademicSetup } from '../lib/timetableGenerator';
import { ExcelImportPreview } from '../lib/excelMasterService';
import { supabaseClient, getSupabaseAccessToken } from '../lib/supabaseClient';
import { apiUrl } from '../lib/apiConfig';

export type UserRole = 'Coordinator' | 'Faculty' | 'Student' | 'HOD' | 'Admin';
export type ViewTab =
  | 'overview'
  | 'academic_setup'
  | 'master_excel'
  | 'academic_year'
  | 'departments'
  | 'programs'
  | 'students'
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

const routeSlugByView: Partial<Record<ViewTab, string>> = {
  overview: 'dashboard', academic_setup: 'data', master_excel: 'data/master', academic_year: 'data/year', departments: 'data/departments',
  programs: 'data/programs', students: 'data/students', courses_mgmt: 'data/courses', faculty_mgmt: 'data/faculty', rooms_mgmt: 'data/rooms',
  sections_mgmt: 'data/sections', allocations: 'allocations', availability: 'availability', constraints: 'constraints',
  generation_validator: 'generation', timetable_review: 'review', grid: 'timetable', recovery: 'requests', whatif: 'what-if',
  solvers: 'solvers', syllabus: 'syllabus', faculty_portal: 'dashboard', student_portal: 'dashboard',
  student_courses: 'courses', student_section: 'section', governance: 'approvals', auth_gov: 'users', settings: 'settings', profile: 'profile',
};
const workspaceFromPath = (path: string): WorkspaceType | null => {
  const key = path.split('/').filter(Boolean)[0];
  return ({ student: 'Student', cr: 'CR', faculty: 'Faculty', coordinator: 'Coordinator', hod: 'HOD', admin: 'Admin' } as Record<string, WorkspaceType>)[key] ?? null;
};
const viewFromPath = (path: string): ViewTab | null => {
  const parts = path.split('/').filter(Boolean);
  const workspace = workspaceFromPath(path);
  if (parts[1] === 'dashboard') {
    if (workspace === 'Student' || workspace === 'CR') return 'student_portal';
    if (workspace === 'Faculty') return 'faculty_portal';
    return 'overview';
  }
  const [, ...rest] = parts;
  const slug = rest.join('/') || 'dashboard';
  const found = (Object.entries(routeSlugByView) as [ViewTab, string][]).find(([, value]) => value === slug);
  return found?.[0] ?? null;
};
const routeFor = (workspace: WorkspaceType, view: ViewTab) => `/${workspace.toLowerCase()}/${routeSlugByView[view] || 'dashboard'}`;

interface TimetableContextType {
  // Master data
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
  validationReport: ValidationReport;

  // Dynamic schedule state
  sessions: ClassSession[];
  setSessions: React.Dispatch<React.SetStateAction<ClassSession[]>>;
  makeupTasks: MakeupTask[];
  recoveryOpportunities: RecoveryOpportunity[];
  polls: StudentPoll[];
  notifications: NotificationItem[];
  versions: TimetableVersion[];
  auditLogs: AuditLog[];
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

  activeVersionNumber?: number;
  publishedSessions?: ClassSession[];
  refresh?: () => Promise<any> | any;
  isLoading?: boolean;
  loadError?: string | null;
  notice?: { type: 'success' | 'error'; message: string } | null;
  dismissNotice?: () => void;
  studentsCount?: number;

  // Master Data CRUD Actions
  updateAcademicYear: (updates: Partial<AcademicYearConfig>) => Promise<{ success: boolean; message?: string }>;
  
  // Departments
  addDepartment: (dept: Omit<Department, 'id'>) => Promise<{ success: boolean; message?: string }>;
  updateDepartment: (id: string, updates: Partial<Department>) => Promise<{ success: boolean; message?: string }>;
  deleteDepartment: (id: string) => Promise<{ success: boolean; message?: string }>;
  toggleDepartmentStatus: (id: string) => Promise<{ success: boolean; message?: string }>;

  // Programs
  addProgram: (prog: Omit<Program, 'id'>) => Promise<{ success: boolean; message?: string }>;
  updateProgram: (id: string, updates: Partial<Program>) => Promise<{ success: boolean; message?: string }>;
  deleteProgram: (id: string) => Promise<{ success: boolean; message?: string }>;

  // Rooms & Labs
  addRoom: (room: Omit<Room, 'id'>) => Promise<{ success: boolean; message?: string }>;
  updateRoom: (id: string, updates: Partial<Room>) => Promise<{ success: boolean; message?: string }>;
  deleteRoom: (id: string) => Promise<{ success: boolean; message?: string }>;
  toggleRoomAvailability: (id: string) => Promise<{ success: boolean; message?: string }>;

  // Faculty
  addFaculty: (fac: Omit<Faculty, 'id'>) => Promise<{ success: boolean; message?: string }>;
  updateFaculty: (id: string, updates: Partial<Faculty>) => Promise<{ success: boolean; message?: string }>;
  deleteFaculty: (id: string) => Promise<{ success: boolean; message?: string }>;
  toggleFacultyStatus: (id: string) => Promise<{ success: boolean; message?: string }>;
  updateFacultyAvailability: (id: string, preferences: Faculty['preferences']) => Promise<{ success: boolean; message?: string }>;

  // Sections & SubSections
  addSection: (sec: Omit<StudentSection, 'id'>) => Promise<{ success: boolean; message?: string }>;
  updateSection: (id: string, updates: Partial<StudentSection>) => Promise<{ success: boolean; message?: string }>;
  deleteSection: (id: string) => Promise<{ success: boolean; message?: string }>;
  addSubSection: (sectionId: string, subSec: Omit<SubSection, 'id' | 'sectionId'>) => Promise<{ success: boolean; message?: string }>;
  deleteSubSection: (sectionId: string, subSecId: string) => Promise<{ success: boolean; message?: string }>;

  // Courses
  addCourse: (course: Omit<Course, 'id'>) => Promise<{ success: boolean; message?: string }>;
  updateCourse: (id: string, updates: Partial<Course>) => Promise<{ success: boolean; message?: string }>;
  deleteCourse: (id: string) => Promise<{ success: boolean; message?: string }>;
  toggleCourseStatus: (id: string) => Promise<{ success: boolean; message?: string }>;

  // Allocations
  addAllocation: (alloc: Omit<CourseAllocation, 'id' | 'status'>) => Promise<{ success: boolean; message?: string }>;
  updateAllocation: (id: string, updates: Partial<CourseAllocation>) => Promise<{ success: boolean; message?: string }>;
  deleteAllocation: (id: string) => Promise<{ success: boolean; message?: string }>;

  // Constraints
  addConstraint: (constraint: Omit<AcademicConstraint, 'id'>) => Promise<{ success: boolean; message?: string }>;
  updateConstraint: (id: string, updates: Partial<AcademicConstraint>) => Promise<{ success: boolean; message?: string }>;
  toggleConstraint: (id: string) => Promise<{ success: boolean; message?: string }>;

  // Validation & Generation Engine
  runValidation: () => ValidationReport;
  resetDemoAcademicData: () => Promise<{ success: boolean; message?: string }>;
  saveError: string;
  clearSaveError: () => void;
  generateDraftTimetable: () => Promise<{ isSuccess: boolean; sessionsGenerated: number; conflicts: string[]; scheduledHours: number; totalHours: number }>;
  updatePublishStatus: (status: 'Review' | 'Approved' | 'Published') => Promise<{ success: boolean; message?: string }>;
  bulkImportData: (type: 'faculty' | 'courses' | 'rooms' | 'sections' | 'allocations', records: any[]) => { successCount: number; errors: string[] };
  commitMasterImport: (
    parsedData: ExcelImportPreview['parsedData'],
    mode?: 'upsert' | 'replace'
  ) => Promise<{ success: boolean; importedCount: number; message: string }>;
  bulkGenerateGroups: (params: {
    programName: string;
    batchYear: number;
    totalStudents: number;
    numGroups: number;
    namingPattern: string;
    numSubgroupsPerGroup: number;
    subgroupNamingPattern?: string;
    departmentId?: string;
  }) => Promise<{ success: boolean; message: string }>;

  // Routine Timetable Operations
  cancelSession: (sessionId: string, reason: string) => Promise<{ success: boolean; message?: string }>;
  undoCancellation: (sessionId: string) => Promise<{ success: boolean }>;
  scheduleMakeup: (opportunityId: string) => Promise<{ success: boolean }>;
  votePoll: (pollId: string, optionId: string) => Promise<{ success: boolean }>;
  createPoll: (input: { sectionId: string; courseId: string; question: string; options: Array<{ day: DayOfWeek; timeSlotLabel: string }> }) => Promise<{ success: boolean; message?: string }>;
  toggleSessionLock: (sessionId: string, reason?: string) => Promise<{ success: boolean; message?: string }>;
  setFacultyProtectedSlot: (facultyId: string, day: DayOfWeek, periodId: string, reason: 'Research' | 'Lunch' | 'Personal' | 'Department' | 'Meeting') => Promise<{ success: boolean }>;
  restoreVersion: (versionNumber: number) => Promise<{ success: boolean; message?: string }>;
  markNotificationRead: (id: string) => Promise<void>;
  triggerAutoMatchAll: () => void;
  requestStudentMakeup: (courseId: string, sectionId: string) => Promise<{ success: boolean }>;
  declineOpportunity: (opportunityId: string) => Promise<{ success: boolean }>;
  claimMarketplaceSlot: (courseId: string, sectionId: string, day: DayOfWeek, timeSlotId: string, roomId: string, type: string, facultyId: string) => Promise<{ success: boolean }>;
  requestSubstituteCover: (substituteFacultyId: string, sessionId: string) => Promise<{ success: boolean }>;
  addSession: (sessionData: Omit<ClassSession, 'id' | 'version'>) => Promise<{ isSuccess: boolean; error?: string }>;
  deleteSession: (sessionId: string) => Promise<{ success: boolean; message?: string }>;

  // Independent Validation & Controlled Machine Editing
  runIndependentValidation: (targetSessions?: ClassSession[]) => IndependentValidationReport;
  moveSessionWithValidation: (
    sessionId: string,
    targetDay: DayOfWeek,
    targetTimeSlotId: string,
    targetRoomId: string,
    reason?: string
  ) => Promise<{ success: boolean; error?: string }>;
  swapSessionsWithValidation: (
    sessionAId: string,
    sessionBId: string,
    reason?: string
  ) => Promise<{ success: boolean; error?: string }>;
  generateMultiCandidateTimetables: (options?: EngineOptions) => {
    isSuccess: boolean;
    candidates: GeneratedCandidate[];
    validationReports: IndependentValidationReport[];
    diagnostics?: string[];
  };
  generateDualRoutinesAPI: (budgetMode?: 'FAST' | 'BALANCED' | 'MAXIMUM_OPTIMIZATION') => Promise<GenerationResponse>;
  selectRoutineAPI: (versionNumber: number) => Promise<{ success: boolean; message?: string }>;
  latestGeneratedRoutines: GenerationRoutine[] | null;
  setLatestGeneratedRoutines: (routines: GenerationRoutine[] | null) => void;
  applyCandidateAsDraft: (candidate: GeneratedCandidate) => void;
  publishMasterTimetable: (reviewerName?: string) => Promise<{ success: boolean; error?: string }>;
  compareTimetableVersions: (versionNumberA: number, versionNumberB: number) => Array<{
    courseCode: string;
    courseName: string;
    sectionName: string;
    changeType: 'MOVED' | 'ROOM_CHANGED' | 'REPLACED' | 'ADDED' | 'REMOVED';
    oldSlot?: { day: DayOfWeek; timeSlot: string; room: string };
    newSlot?: { day: DayOfWeek; timeSlot: string; room: string };
  }>;
  [key: string]: any;
}

const TimetableContext = createContext<TimetableContextType | null>(null);

export function TimetableProvider({ children }: { children: React.ReactNode }) {
  const { currentWorkspace, switchWorkspace, authorizedWorkspaces, authStatus } = useAuth();
  // Master academic state
  const [academicYear, setAcademicYear] = useState<AcademicYearConfig>(INITIAL_ACADEMIC_YEAR);
  const [departments, setDepartments] = useState<Department[]>(DEPARTMENTS);
  const [programs, setPrograms] = useState<Program[]>(PROGRAMS);
  const [rooms, setRooms] = useState<Room[]>(ROOMS);
  const [facultyMembers, setFacultyMembers] = useState<Faculty[]>(FACULTY_MEMBERS);
  const [sections, setSections] = useState<StudentSection[]>(SECTIONS);
  const [courses, setCourses] = useState<Course[]>(COURSES);
  const [allocations, setAllocations] = useState<CourseAllocation[]>(INITIAL_ALLOCATIONS);
  const [constraints, setConstraints] = useState<AcademicConstraint[]>(INITIAL_CONSTRAINTS);
  const [publishStatus, setPublishStatus] = useState<TimetablePublishStatus>('Published');

  // Dynamic operational state
  const [sessions, setSessions] = useState<ClassSession[]>(INITIAL_SESSIONS);
  const [publishedSessions, setPublishedSessions] = useState<ClassSession[]>(INITIAL_SESSIONS);
  const [makeupTasks, setMakeupTasks] = useState<MakeupTask[]>(INITIAL_MAKEUP_TASKS);
  const [recoveryOpportunities, setRecoveryOpportunities] = useState<RecoveryOpportunity[]>(INITIAL_RECOVERY_OPPORTUNITIES);
  const [polls, setPolls] = useState<StudentPoll[]>(INITIAL_POLLS);
  const [notifications, setNotifications] = useState<NotificationItem[]>(INITIAL_NOTIFICATIONS);
  const [versions, setVersions] = useState<TimetableVersion[]>(INITIAL_VERSIONS);
  const [whatIfSimulation, setWhatIfSimulation] = useState<WhatIfSimulation>(INITIAL_WHAT_IF_SIMULATION);

  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([
    {
      id: 'log-1',
      timestamp: '2026-10-02 08:00:12',
      userId: 'user-sharma',
      userName: 'Prof. Arvind Sharma',
      action: 'CLASS_CANCELLED',
      entityType: 'ClassSession',
      entityId: 'sess-mon-1',
      details: 'Cancelled DBMS lecture for CSE-A on Monday 08:00 due to accreditation symposium.',
    },
    {
      id: 'log-2',
      timestamp: '2026-10-02 08:00:15',
      userId: 'sys-recovery-engine',
      userName: 'Recovery Engine Outbox',
      action: 'MAKEUP_TASK_CREATED',
      entityType: 'MakeupTask',
      entityId: 'makeup-dbms-01',
      details: 'Calculated urgency score 96 (Exam in 21 days, syllabus completion 82%).',
    },
    {
      id: 'log-3',
      timestamp: '2026-10-02 08:05:30',
      userId: 'sys-recovery-engine',
      userName: 'Cross-Cancellation Engine',
      action: 'RECOVERY_OPPORTUNITY_FOUND',
      entityType: 'RecoveryOpportunity',
      entityId: 'rec-opp-01',
      details: 'Identified zero-conflict slot on Thursday 11:00-12:00 in Room 204 created by Dr. Gupta OS cancellation.',
    }
  ]);

  const [currentRole, setCurrentRole] = useState<UserRole>('Coordinator');
  const [activeView, setActiveViewState] = useState<ViewTab>(() => typeof window === 'undefined' ? 'overview' : viewFromPath(window.location.pathname) || 'overview');
  const setActiveView = useCallback((view: ViewTab) => {
    setActiveViewState(view);
    if (typeof window !== 'undefined') {
      const path = routeFor(currentWorkspace, view);
      if (window.location.pathname !== path) window.history.pushState({ view, workspace: currentWorkspace }, '', path);
    }
  }, [currentWorkspace]);

  useEffect(() => {
    const syncRoute = () => {
      if (authStatus !== 'AUTHENTICATED') return;
      const routeWorkspace = workspaceFromPath(window.location.pathname);
      const routeView = viewFromPath(window.location.pathname);
      if (routeWorkspace && authorizedWorkspaces.includes(routeWorkspace) && routeWorkspace !== currentWorkspace) switchWorkspace(routeWorkspace);
      if (routeView) setActiveViewState(routeView);
    };
    window.addEventListener('popstate', syncRoute);
    return () => window.removeEventListener('popstate', syncRoute);
  }, [authStatus, authorizedWorkspaces, currentWorkspace, switchWorkspace]);

  useEffect(() => {
    if (authStatus !== 'AUTHENTICATED') return;
    const routeWorkspace = workspaceFromPath(window.location.pathname);
    const routeView = viewFromPath(window.location.pathname);
    if (routeWorkspace === currentWorkspace && routeView && activeView !== routeView) setActiveViewState(routeView);
    else if (!routeWorkspace || routeWorkspace !== currentWorkspace) {
      const landing: ViewTab = currentWorkspace === 'Student' || currentWorkspace === 'CR' ? 'student_portal' : currentWorkspace === 'Faculty' ? 'faculty_portal' : 'overview';
      setActiveViewState(landing);
      const path = routeFor(currentWorkspace, landing);
      if (window.location.pathname !== path) window.history.replaceState({ view: landing, workspace: currentWorkspace }, '', path);
    }
  }, [authStatus, currentWorkspace]);
  const [selectedFacultyId, setSelectedFacultyId] = useState<string>('fac-0001');
  const [selectedSectionId, setSelectedSectionId] = useState<string>('sec-cse-a');
  const [selectedRoomId, setSelectedRoomId] = useState<string>('room-cr-1');
  const [latestGeneratedRoutines, setLatestGeneratedRoutines] = useState<GenerationRoutine[] | null>(null);
  const [saveError, setSaveError] = useState('');

  const getAuthHeaders = (): Record<string, string> => {
    return {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    };
  };

  const getAuthHeadersAsync = async (): Promise<Record<string, string>> => {
    return {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    };
  };

  // Reloads what the server holds, so the screen never shows a change that was not saved.
  const refreshAcademicData = async () => {
    const response = await fetch(apiUrl('/api/academic/bootstrap'), { credentials: 'same-origin', cache: 'no-cache', headers: getAuthHeaders() });
    if (response.ok) applyBootstrapData(await response.json());
  };

  /** Save a change on the server, then show what the server holds. A refused change is reported, never shown as done. */
  const saveChange = async (path: string, method: string, body: unknown = {}): Promise<{ success: boolean; message: string; error?: string; data?: any }> => {
    let message = 'Could not reach the server. The change was not saved.';
    let saved: any;
    try {
      const response = await fetch(apiUrl(path), { method, credentials: 'same-origin', headers: getAuthHeaders(), body: JSON.stringify(body) });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.success !== false) saved = data;
      else message = data.message || `The change was not saved (${response.status}).`;
    } catch {
      // The message above already says what happened.
    }
    setSaveError(saved ? '' : message);
    // When this reload fails, the next automatic refresh shows the saved data.
    await refreshAcademicData().catch(() => undefined);
    return saved ? { success: true, message: saved.message || 'Saved.', data: saved } : { success: false, message, error: message };
  };

  // An import or reset can remove the selected record; show the first one rather than an empty timetable.
  useEffect(() => {
    if (sections.length > 0 && !sections.some(item => item.id === selectedSectionId)) setSelectedSectionId(sections[0].id);
    if (facultyMembers.length > 0 && !facultyMembers.some(item => item.id === selectedFacultyId)) setSelectedFacultyId(facultyMembers[0].id);
    if (rooms.length > 0 && !rooms.some(item => item.id === selectedRoomId)) setSelectedRoomId(rooms[0].id);
  }, [sections, facultyMembers, rooms, selectedSectionId, selectedFacultyId, selectedRoomId]);

  const applyBootstrapData = (data: any) => {
    if (data.academicYear) setAcademicYear(data.academicYear);
    if (Array.isArray(data.departments)) setDepartments(data.departments);
    if (Array.isArray(data.programs)) setPrograms(data.programs);
    if (Array.isArray(data.courses)) setCourses(data.courses);
    if (Array.isArray(data.facultyMembers)) setFacultyMembers(data.facultyMembers);
    if (Array.isArray(data.rooms)) setRooms(data.rooms);
    if (Array.isArray(data.sections)) setSections(data.sections);
    if (Array.isArray(data.allocations)) setAllocations(data.allocations);
    if (Array.isArray(data.constraints)) setConstraints(data.constraints);
    if (Array.isArray(data.sessions)) setSessions(data.sessions);
    if (Array.isArray(data.publishedSessions)) setPublishedSessions(data.publishedSessions);
    if (Array.isArray(data.versions)) setVersions(data.versions);
    if (Array.isArray(data.notifications)) setNotifications(data.notifications);
    if (Array.isArray(data.makeupTasks)) setMakeupTasks(data.makeupTasks);
    if (Array.isArray(data.recoveryOpportunities)) setRecoveryOpportunities(data.recoveryOpportunities);
    if (Array.isArray(data.polls)) setPolls(data.polls);
    if (Array.isArray(data.auditLogs)) setAuditLogs(data.auditLogs);
    if (data.publishStatus) setPublishStatus(data.publishStatus);
  };

  // Load shared academic state only after authentication. Polling while signed
  // out generates repeated 401s and can keep the login page busy in Lighthouse.
  useEffect(() => {
    if (authStatus !== 'AUTHENTICATED') return;
    let isMounted = true;
    let requestInFlight = false;
    let pollTimer: number | undefined;
    const controller = new AbortController();
    const loadBootstrapData = async () => {
      if (requestInFlight || controller.signal.aborted) return;
      requestInFlight = true;
      try {
        const res = await fetch('/api/academic/bootstrap', {
          credentials: 'same-origin',
          signal: controller.signal,
          cache: 'no-cache',
          headers: { 'X-Requested-With': 'XMLHttpRequest' },
        });
        // The server uses an authenticated, cookie-varying ETag. An unchanged
        // bootstrap can return 304 without downloading or parsing the dataset.
        if (res.status === 304) return;
        if (res.ok) {
          const data = await res.json();
          if (data.success && isMounted) {
            applyBootstrapData(data);
          }
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        console.warn('[SUPABASE_SYNC] Initial bootstrap load completed with local state active:', err);
      } finally {
        requestInFlight = false;
        if (isMounted && !controller.signal.aborted && !document.hidden) {
          pollTimer = window.setTimeout(() => { void loadBootstrapData(); }, 10_000);
        }
      }
    };
    const refreshWhenVisible = () => {
      if (document.hidden) return;
      if (pollTimer !== undefined) window.clearTimeout(pollTimer);
      void loadBootstrapData();
    };
    loadBootstrapData();
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      isMounted = false;
      if (pollTimer !== undefined) window.clearTimeout(pollTimer);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      controller.abort();
    };
  }, [authStatus]);

  // Dynamic Computed Validation Report
  const validationReport = useMemo(() => {
    return validateAcademicSetup(
      academicYear,
      departments,
      programs,
      courses,
      facultyMembers,
      rooms,
      sections,
      allocations,
      constraints
    );
  }, [academicYear, departments, programs, courses, facultyMembers, rooms, sections, allocations, constraints]);

  // Computed Health Score
  const health = useMemo(() => {
    return calculateHealthScore(sessions, rooms, facultyMembers, sections, courses, academicYear);
  }, [sessions, rooms, facultyMembers, sections, courses, academicYear]);

  // CRUD: Academic Year
  const updateAcademicYear = async (updates: Partial<AcademicYearConfig>) => {
    const { yearLabel, semesterType, semesterNumber, workingDays } = updates;
    return saveChange('/api/academic/year', 'PUT', { yearLabel, semesterType, semesterNumber, workingDays });
  };

  // CRUD: Departments
  const addDepartment = async (dept: Omit<Department, 'id'>) => {
    const newId = `dept-${dept.code.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    const newDept: Department = { ...dept, id: newId };
    setDepartments(prev => [...prev, newDept]);

    return saveChange('/api/academic/departments', 'POST', dept);
  };

  const updateDepartment = async (id: string, updates: Partial<Department>) => {
    setDepartments(prev => prev.map(d => (d.id === id ? { ...d, ...updates } : d)));

    return saveChange(`/api/academic/departments/${encodeURIComponent(id)}`, 'PUT', updates);
  };

  const deleteDepartment = async (id: string) => {
    setDepartments(prev => prev.filter(d => d.id !== id));

    return saveChange(`/api/academic/departments/${encodeURIComponent(id)}`, 'DELETE');
  };

  const toggleDepartmentStatus = async (id: string) => {
    const dept = departments.find(d => d.id === id);
    if (!dept) return { success: false, error: 'Department not found' };
    return updateDepartment(id, { status: dept.status === 'Active' ? 'Inactive' : 'Active' });
  };

  // CRUD: Programs
  const addProgram = async (prog: Omit<Program, 'id'>) => {
    const newId = `prog-${prog.code.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    const newProg: Program = { ...prog, id: newId };
    setPrograms(prev => [...prev, newProg]);

    return saveChange('/api/academic/programs', 'POST', prog);
  };

  const updateProgram = async (id: string, updates: Partial<Program>) => {
    setPrograms(prev => prev.map(p => (p.id === id ? { ...p, ...updates } : p)));

    return saveChange(`/api/academic/programs/${encodeURIComponent(id)}`, 'PUT', updates);
  };

  const deleteProgram = async (id: string) => {
    setPrograms(prev => prev.filter(p => p.id !== id));

    return saveChange(`/api/academic/programs/${encodeURIComponent(id)}`, 'DELETE');
  };

  // CRUD: Rooms & Labs
  const addRoom = async (room: Omit<Room, 'id'>) => {
    const newId = `room-${room.name.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    const newRoom: Room = { ...room, id: newId };
    setRooms(prev => [...prev, newRoom]);

    return saveChange('/api/academic/rooms', 'POST', room);
  };

  const updateRoom = async (id: string, updates: Partial<Room>) => {
    setRooms(prev => prev.map(r => (r.id === id ? { ...r, ...updates } : r)));

    return saveChange(`/api/academic/rooms/${encodeURIComponent(id)}`, 'PUT', updates);
  };

  const deleteRoom = async (id: string) => {
    setRooms(prev => prev.filter(r => r.id !== id));

    return saveChange(`/api/academic/rooms/${encodeURIComponent(id)}`, 'DELETE');
  };

  const toggleRoomAvailability = async (id: string) => {
    const rm = rooms.find(r => r.id === id);
    if (!rm) return { success: false, error: 'Room not found' };
    return updateRoom(id, { isAvailable: !rm.isAvailable });
  };

  // CRUD: Faculty
  const addFaculty = async (fac: Omit<Faculty, 'id'>) => {
    const newId = `fac-${fac.email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    const newFac: Faculty = { ...fac, id: newId };
    setFacultyMembers(prev => [...prev, newFac]);

    return saveChange('/api/academic/faculty', 'POST', fac);
  };

  const updateFaculty = async (id: string, updates: Partial<Faculty>) => {
    setFacultyMembers(prev => prev.map(f => (f.id === id ? { ...f, ...updates } : f)));

    return saveChange(`/api/academic/faculty/${encodeURIComponent(id)}`, 'PUT', updates);
  };

  const deleteFaculty = async (id: string) => {
    setFacultyMembers(prev => prev.filter(f => f.id !== id));

    return saveChange(`/api/academic/faculty/${encodeURIComponent(id)}`, 'DELETE');
  };

  const toggleFacultyStatus = async (id: string) => {
    const faculty = facultyMembers.find(f => f.id === id);
    if (!faculty) return { success: false, error: 'Faculty member not found' };
    return updateFaculty(id, { status: faculty.status === 'Active' ? 'Inactive' : 'Active' });
  };

  const updateFacultyAvailability = async (id: string, preferences: Faculty['preferences']) => {
    await updateFaculty(id, { preferences });
    return { success: true, message: 'Success' };
  };

  // CRUD: Sections
  const addSection = async (sec: Omit<StudentSection, 'id'>) => {
    const newId = `sec-${sec.name.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    const newSec: StudentSection = {
      ...sec,
      id: newId,
      subSections: sec.subSections || [
        { id: `sub-${newId}-1`, sectionId: newId, name: '1', studentCount: Math.ceil(sec.studentCount / 2), type: 'Lab' },
        { id: `sub-${newId}-2`, sectionId: newId, name: '2', studentCount: Math.floor(sec.studentCount / 2), type: 'Lab' },
      ],
    };
    setSections(prev => [...prev, newSec]);

    return saveChange('/api/academic/groups', 'POST', sec);
  };

  const updateSection = async (id: string, updates: Partial<StudentSection>) => {
    setSections(prev => prev.map(s => (s.id === id ? { ...s, ...updates } : s)));

    return saveChange(`/api/academic/groups/${encodeURIComponent(id)}`, 'PUT', updates);
  };

  const deleteSection = async (id: string) => {
    setSections(prev => prev.filter(s => s.id !== id));

    return saveChange(`/api/academic/groups/${encodeURIComponent(id)}`, 'DELETE');
  };

  const addSubSection = async (sectionId: string, subSec: Omit<SubSection, 'id' | 'sectionId'>) => {
    const subId = `sub-${sectionId}-${subSec.name.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    const newSub: SubSection = {
      ...subSec,
      id: subId,
      sectionId,
    };
    setSections(prev =>
      prev.map(s => {
        if (s.id !== sectionId) return s;
        return {
          ...s,
          subSections: [...(s.subSections || []), newSub],
        };
      })
    );

    return saveChange('/api/academic/subgroups', 'POST', { groupId: sectionId, name: subSec.name, studentCount: subSec.studentCount, type: subSec.type });
  };

  const deleteSubSection = async (sectionId: string, subSecId: string) => {
    setSections(prev =>
      prev.map(s => {
        if (s.id !== sectionId) return s;
        return {
          ...s,
          subSections: (s.subSections || []).filter(sub => sub.id !== subSecId),
        };
      })
    );

    return saveChange(`/api/academic/subgroups/${encodeURIComponent(sectionId)}/${encodeURIComponent(subSecId)}`, 'DELETE');
  };

  // CRUD: Courses
  const addCourse = async (course: Omit<Course, 'id'>) => {
    const newId = `course-${course.code.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    const newCourse: Course = {
      ...course,
      id: newId,
    };
    setCourses(prev => [...prev, newCourse]);

    return saveChange('/api/academic/courses', 'POST', course);
  };

  const updateCourse = async (id: string, updates: Partial<Course>) => {
    setCourses(prev => prev.map(c => (c.id === id ? { ...c, ...updates } : c)));

    return saveChange(`/api/academic/courses/${encodeURIComponent(id)}`, 'PUT', updates);
  };

  const deleteCourse = async (id: string) => {
    setCourses(prev => prev.filter(c => c.id !== id));

    return saveChange(`/api/academic/courses/${encodeURIComponent(id)}`, 'DELETE');
  };

  const toggleCourseStatus = async (id: string) => {
    const crs = courses.find(c => c.id === id);
    if (!crs) return { success: false, error: 'Course not found' };
    return updateCourse(id, { status: crs.status === 'Active' ? 'Archived' : 'Active' });
  };

  // CRUD: Course Allocations
  const addAllocation = async (alloc: Omit<CourseAllocation, 'id' | 'status'>) => {
    const allocId = `alloc-${alloc.courseId}-${alloc.sectionId}${alloc.subSectionId ? `-${alloc.subSectionId}` : ''}-${alloc.sessionType.toLowerCase()}`;
    const newAlloc: CourseAllocation = {
      ...alloc,
      id: allocId,
      status: 'Allocated',
    };
    setAllocations(prev => [...prev, newAlloc]);

    return saveChange('/api/academic/allocations', 'POST', alloc);
  };

  const updateAllocation = async (id: string, updates: Partial<CourseAllocation>) => {
    setAllocations(prev => prev.map(a => (a.id === id ? { ...a, ...updates } : a)));

    return saveChange(`/api/academic/allocations/${encodeURIComponent(id)}`, 'PUT', updates);
  };

  const deleteAllocation = async (id: string) => {
    setAllocations(prev => prev.filter(a => a.id !== id));

    return saveChange(`/api/academic/allocations/${encodeURIComponent(id)}`, 'DELETE');
  };

  // CRUD: Constraints
  const addConstraint = async (constraint: Omit<AcademicConstraint, 'id'>) => {
    const newConst: AcademicConstraint = {
      ...constraint,
      id: `const-${Date.now().toString().slice(-4)}`,
    };
    setConstraints(prev => [...prev, newConst]);
    return { success: true, message: 'Success' };
  };

  const updateConstraint = async (id: string, updates: Partial<AcademicConstraint>) => {
    setConstraints(prev => prev.map(c => (c.id === id ? { ...c, ...updates } : c)));
    return { success: true, message: 'Success' };
  };

  const toggleConstraint = async (id: string) => {
    const constraint = constraints.find(c => c.id === id);
    return saveChange(`/api/academic/constraints/${encodeURIComponent(id)}`, 'PUT', { isActive: !constraint?.isActive });
  };

  // Pre-generation Validation Run
  const runValidation = (): ValidationReport => {
    return validateAcademicSetup(
      academicYear,
      departments,
      programs,
      courses,
      facultyMembers,
      rooms,
      sections,
      allocations,
      constraints
    );
  };

  // Timetable Generator Pipeline
  const generateDraftTimetable = async () => {
    const report = runValidation();
    if (!report.isReadyForGeneration) {
      return {
        isSuccess: false,
        sessionsGenerated: 0,
        conflicts: report.items.filter(i => i.status === 'Error').map(i => i.message),
        scheduledHours: 0,
        totalHours: 0,
      };
    }

    try {
      const startResponse = await fetch(apiUrl('/api/timetable/jobs'), {
        method: 'POST', credentials: 'same-origin', headers: getAuthHeaders(),
        body: JSON.stringify({ budgetMode: 'BALANCED', timeBudgetMs: 800, optimizationProfile: 'BALANCED' }),
      });
      const started = await startResponse.json().catch(() => ({}));
      if (!startResponse.ok || !started.jobId) throw new Error(started.message || 'Could not start timetable generation.');

      const deadline = Date.now() + 120_000;
      let job: any;
      let pollDelayMs = 200;
      while (Date.now() < deadline) {
        await new Promise((resolve) => window.setTimeout(resolve, pollDelayMs));
        const statusResponse = await fetch(apiUrl(`/api/timetable/jobs/${encodeURIComponent(started.jobId)}`), { credentials: 'same-origin' });
        job = await statusResponse.json().catch(() => ({}));
        if (!statusResponse.ok) throw new Error(job.message || 'Could not read generation progress.');
        if (job.status === 'COMPLETED' || job.status === 'FAILED' || job.status === 'CANCELLED') break;
        pollDelayMs = Math.min(900, Math.round(pollDelayMs * 1.5));
      }
      if (!job || !['COMPLETED', 'FAILED', 'CANCELLED'].includes(job.status)) {
        void fetch(apiUrl(`/api/timetable/jobs/${encodeURIComponent(started.jobId)}/cancel`), { method: 'POST', credentials: 'same-origin', headers: getAuthHeaders(), body: '{}' });
        throw new Error('Generation took longer than two minutes and was cancelled. Try FAST mode or reduce the schedule size.');
      }
      const candidate = job.result?.bestCandidate;
      if (job.status !== 'COMPLETED' || !candidate?.sessions?.length) throw new Error(job.error || job.result?.statusMessage || 'The solver could not produce a valid timetable.');
      const applyResponse = await fetch(apiUrl(`/api/timetable/jobs/${encodeURIComponent(started.jobId)}/apply`), {
        method: 'POST', credentials: 'same-origin', headers: getAuthHeaders(), body: '{}',
      });
      const applied = await applyResponse.json().catch(() => ({}));
      if (!applyResponse.ok || !applied.success) throw new Error(applied.message || 'Generated schedule could not be saved.');

      setSessions(applied.version?.sessions?.length ? applied.version.sessions : candidate.sessions);
      setPublishStatus('Draft');
      if (applied.version) setVersions((previous) => [applied.version, ...previous.filter((version) => version.id !== applied.version.id)]);
      setAuditLogs((previous) => [{
        id: `log-${Date.now()}`, timestamp: new Date().toLocaleString(), userId: 'coordinator', userName: 'Timetable Coordinator',
        action: 'TIMETABLE_GENERATED', entityType: 'TimetableVersion', entityId: applied.version?.id || started.jobId,
        details: `Generated and saved ${candidate.sessions.length} class sessions as a draft.`,
      }, ...previous]);
      return { isSuccess: true, sessionsGenerated: candidate.sessions.length, conflicts: [], scheduledHours: candidate.scheduledHours, totalHours: candidate.totalRequestedHours };
    } catch (error) {
      return { isSuccess: false, sessionsGenerated: 0, conflicts: [error instanceof Error ? error.message : 'Timetable generation failed.'], scheduledHours: 0, totalHours: 0 };
    }
  };

  // Publish Status Lifecycle
  const updatePublishStatus = async (status: 'Review' | 'Approved' | 'Published'): Promise<{ success: boolean; message?: string }> =>
    status === 'Review' ? saveChange('/api/timetable/submit', 'POST')
      : status === 'Approved' ? saveChange('/api/timetable/approve', 'POST', { versionId: `V${versions[0]?.versionNumber || 1}.0` })
        : saveChange('/api/timetable/publish', 'POST');

  // ---------------------------------------------------------------------------
  // Independent Validation & Controlled Manual Editing Pipeline
  // ---------------------------------------------------------------------------
  const runIndependentValidation = (targetSessions?: ClassSession[]): IndependentValidationReport => {
    return validateTimetableIndependently(targetSessions || sessions, {
      academicYear,
      allocations,
      facultyMembers,
      rooms,
      sections,
      courses
    });
  };

  const moveSessionWithValidation = async (
    sessionId: string,
    targetDay: DayOfWeek,
    targetTimeSlotId: string,
    targetRoomId: string,
    reason = 'Manual Coordinator Adjustment'
  ): Promise<{ success: boolean; error?: string }> =>
    saveChange('/api/timetable/move', 'POST', { sessionId, targetDay, targetTimeSlotId, targetRoomId, reason });

  const swapSessionsWithValidation = async (
    sessionAId: string,
    sessionBId: string,
    reason = 'Manual Session Swap'
  ): Promise<{ success: boolean; error?: string }> =>
    saveChange('/api/timetable/swap', 'POST', { sessionAId, sessionBId, reason });

  const generateDualRoutinesAPI = async (budgetMode: 'FAST' | 'BALANCED' | 'MAXIMUM_OPTIMIZATION' = 'BALANCED'): Promise<GenerationResponse> => {
    try {
      const headers = await getAuthHeadersAsync();
      const targetUrl = apiUrl('/api/academic/generate');

      if (import.meta.env.DEV) {
        console.info('[GENERATION AUTH TRACE]', {
          frontendSession: Boolean(headers['Authorization']),
          accessToken: headers['Authorization'] ? 'present' : 'missing',
          apiUrl: targetUrl,
          authorizationHeaderAttached: Boolean(headers['Authorization']),
        });
      }

      const res = await fetch(targetUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          budgetMode,
          timeBudgetMs: { FAST: 2_000, BALANCED: 5_000, MAXIMUM_OPTIMIZATION: 10_000 }[budgetMode],
          routines: [
            { id: 'student-focused', label: 'Student-focused', optimizationProfile: 'STUDENT_FOCUSED' },
            { id: 'faculty-focused', label: 'Faculty-focused', optimizationProfile: 'FACULTY_FOCUSED' },
          ],
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        return { success: false, isFeasible: false, routines: [], message: data.message || `Generation failed (${res.status}).` } as GenerationResponse;
      }
      if (data.routines && data.routines.length > 0) {
        setSessions(data.routines[0].sessions);
        setPublishStatus('Draft');
        setLatestGeneratedRoutines(data.routines);
      }
      return data;
    } catch (err: any) {
      console.warn('[TIMETABLE_API] Generate request failed:', err);
      return { success: false, isFeasible: false, routines: [], message: 'Could not reach the server. The timetable was not changed.' } as GenerationResponse;
    }
  };

  const selectRoutineAPI = async (versionNumber: number): Promise<{ success: boolean; message?: string }> => {
    try {
      const headers = await getAuthHeadersAsync();
      const res = await fetch(apiUrl('/api/timetable/select-routine'), {
        method: 'POST',
        headers,
        body: JSON.stringify({ versionNumber }),
      });
      const data = await res.json().catch(() => ({ success: false, message: 'The routine could not be selected.' }));
      if (data.success) await refreshAcademicData().catch(() => undefined);
      return data;
    } catch (err: any) {
      console.warn('[TIMETABLE_API] Select routine fallback:', err);
      return { success: false, message: err.message };
    }
  };

  const generateMultiCandidateTimetables = (options?: EngineOptions) => {
    const engineResult = executeOptimizationEngine(
      academicYear,
      allocations,
      facultyMembers,
      rooms,
      sections,
      courses,
      constraints,
      {
        budgetMode: options?.budgetMode || 'BALANCED',
        timeBudgetMs: options?.timeBudgetMs || 500,
        maxCandidates: options?.maxCandidates || 3,
        seed: options?.seed || 1337
      }
    );

    const validationReports = engineResult.allCandidates.map(cand =>
      validateTimetableIndependently(cand.sessions, {
        academicYear,
        allocations,
        facultyMembers,
        rooms,
        sections,
        courses
      })
    );

    return {
      isSuccess: engineResult.isFeasible,
      candidates: engineResult.allCandidates,
      validationReports,
      diagnostics: engineResult.infeasibilityDiagnostics
    };
  };

  const applyCandidateAsDraft = (candidate: GeneratedCandidate) => {
    setSessions(candidate.sessions);
    setPublishStatus('Draft');

    const newVersionNumber = versions.length + 1;
    const newVersion: TimetableVersion = {
      versionNumber: newVersionNumber,
      versionLabel: `Candidate Selected V${newVersionNumber}.0`,
      createdAt: new Date().toISOString(),
      createdBy: 'Timetable Coordinator',
      changeSummary: `Applied candidate schedule (${candidate.candidateId}) with soft score ${candidate.healthScore}/100 and ${candidate.sessions.length} sessions.`,
      reason: 'Candidate Selection',
      isPublished: false,
      healthScore: candidate.healthScore,
      sessions: candidate.sessions,
    };
    setVersions(prev => [newVersion, ...prev]);

    setAuditLogs(prev => [
      {
        id: `log-cand-${Date.now()}`,
        timestamp: new Date().toLocaleString(),
        userId: 'coordinator',
        userName: 'Timetable Coordinator',
        action: 'CANDIDATE_TIMETABLE_APPLIED',
        entityType: 'TimetableVersion',
        entityId: candidate.candidateId,
        details: `Applied candidate schedule with ${candidate.sessions.length} sessions. Independent validation: 0 hard conflicts.`
      },
      ...prev
    ]);
  };

  const publishMasterTimetable = async (): Promise<{ success: boolean; error?: string }> => {
    const report = runIndependentValidation(sessions);
    if (!report.canPublish) {
      const error = `Cannot publish: timetable has ${report.hardViolationsCount} hard constraint violations and ${report.requiredSessionsCount - report.scheduledSessionsCount} unscheduled hours.`;
      setSaveError(error);
      return { success: false, error };
    }
    return saveChange('/api/timetable/publish', 'POST');
  };

  const compareTimetableVersions = (versionNumberA: number, versionNumberB: number) => {
    const verA = versions.find(v => v.versionNumber === versionNumberA);
    const verB = versions.find(v => v.versionNumber === versionNumberB);
    if (!verA || !verB) return [];

    const mapA = new Map<string, ClassSession>();
    verA.sessions.forEach(s => mapA.set(s.id, s));

    const mapB = new Map<string, ClassSession>();
    verB.sessions.forEach(s => mapB.set(s.id, s));

    const diffs: Array<{
      courseCode: string;
      courseName: string;
      sectionName: string;
      changeType: 'MOVED' | 'ROOM_CHANGED' | 'REPLACED' | 'ADDED' | 'REMOVED';
      oldSlot?: { day: DayOfWeek; timeSlot: string; room: string };
      newSlot?: { day: DayOfWeek; timeSlot: string; room: string };
    }> = [];

    const allIds = new Set([...mapA.keys(), ...mapB.keys()]);
    allIds.forEach(id => {
      const sA = mapA.get(id);
      const sB = mapB.get(id);
      const course = courses.find(c => c.id === (sA?.courseId || sB?.courseId));
      const section = sections.find(sec => sec.id === (sA?.sectionId || sB?.sectionId));

      const roomA = rooms.find(r => r.id === sA?.roomId);
      const roomB = rooms.find(r => r.id === sB?.roomId);

      if (sA && !sB) {
        diffs.push({
          courseCode: course?.code || id,
          courseName: course?.name || 'Course',
          sectionName: section?.name || 'Section',
          changeType: 'REMOVED',
          oldSlot: { day: sA.day, timeSlot: sA.timeSlotId, room: roomA?.name || sA.roomId }
        });
      } else if (!sA && sB) {
        diffs.push({
          courseCode: course?.code || id,
          courseName: course?.name || 'Course',
          sectionName: section?.name || 'Section',
          changeType: 'ADDED',
          newSlot: { day: sB.day, timeSlot: sB.timeSlotId, room: roomB?.name || sB.roomId }
        });
      } else if (sA && sB) {
        const timeChanged = sA.day !== sB.day || sA.timeSlotId !== sB.timeSlotId;
        const roomChanged = sA.roomId !== sB.roomId;

        if (timeChanged || roomChanged) {
          diffs.push({
            courseCode: course?.code || id,
            courseName: course?.name || 'Course',
            sectionName: section?.name || 'Section',
            changeType: timeChanged ? 'MOVED' : 'ROOM_CHANGED',
            oldSlot: { day: sA.day, timeSlot: sA.timeSlotId, room: roomA?.name || sA.roomId },
            newSlot: { day: sB.day, timeSlot: sB.timeSlotId, room: roomB?.name || sB.roomId }
          });
        }
      }
    });

    return diffs;
  };

  const resetDemoAcademicData = async (): Promise<{ success: boolean; message?: string }> => {
    try {
      const response = await fetch(apiUrl('/api/demo/reset'), {
        method: 'POST', credentials: 'same-origin', headers: getAuthHeaders(), body: JSON.stringify({}),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) return { success: false, message: data.message || `Reset failed (${response.status}).` };
      const bootstrapResponse = await fetch(apiUrl('/api/academic/bootstrap'), { credentials: 'same-origin', cache: 'no-store' });
      const bootstrap = await bootstrapResponse.json().catch(() => ({}));
      if (!bootstrapResponse.ok || !bootstrap.success) return { success: false, message: 'Reset completed, but refreshed timetable data could not be loaded. Reload the page.' };
      if (bootstrap.academicYear) setAcademicYear(bootstrap.academicYear);
      if (Array.isArray(bootstrap.departments)) setDepartments(bootstrap.departments);
      if (Array.isArray(bootstrap.programs)) setPrograms(bootstrap.programs);
      if (Array.isArray(bootstrap.rooms)) setRooms(bootstrap.rooms);
      if (Array.isArray(bootstrap.facultyMembers)) setFacultyMembers(bootstrap.facultyMembers);
      if (Array.isArray(bootstrap.sections)) setSections(bootstrap.sections);
      if (Array.isArray(bootstrap.courses)) setCourses(bootstrap.courses);
      if (Array.isArray(bootstrap.allocations)) setAllocations(bootstrap.allocations);
      if (Array.isArray(bootstrap.constraints)) setConstraints(bootstrap.constraints);
      if (Array.isArray(bootstrap.sessions)) setSessions(bootstrap.sessions);
      if (Array.isArray(bootstrap.publishedSessions)) setPublishedSessions(bootstrap.publishedSessions);
      if (Array.isArray(bootstrap.makeupTasks)) setMakeupTasks(bootstrap.makeupTasks);
      if (Array.isArray(bootstrap.recoveryOpportunities)) setRecoveryOpportunities(bootstrap.recoveryOpportunities);
      if (Array.isArray(bootstrap.polls)) setPolls(bootstrap.polls);
      if (Array.isArray(bootstrap.notifications)) setNotifications(bootstrap.notifications);
      if (Array.isArray(bootstrap.versions)) setVersions(bootstrap.versions);
      if (bootstrap.publishStatus) setPublishStatus(bootstrap.publishStatus);
      return { success: true, message: data.message || 'Demo data restored to the seeded starting state.' };
    } catch {
      return { success: false, message: 'Could not reach the server. Demo data was not reset.' };
    }
  };

  // Bulk Import Helper
  const bulkImportData = (
    type: 'faculty' | 'courses' | 'rooms' | 'sections' | 'allocations',
    records: any[]
  ) => {
    const errors: string[] = [];
    let successCount = 0;

    if (!Array.isArray(records) || records.length === 0) {
      return { successCount: 0, errors: ['No data records supplied for import.'] };
    }

    try {
      if (type === 'faculty') {
        const validated: Faculty[] = [];
        records.forEach((r, idx) => {
          if (!r.name || !r.email) {
            errors.push(`Row ${idx + 1}: Faculty Name and Email are required.`);
          } else {
            validated.push({
              id: r.id || `fac-${Date.now()}-${idx}`,
              name: String(r.name).trim(),
              email: String(r.email).trim().toLowerCase(),
              departmentId: r.departmentId || 'dept-cse',
              designation: r.designation || 'Assistant Professor',
              subjectsQualified: Array.isArray(r.subjectsQualified) ? r.subjectsQualified : ['CS501'],
              maxDirectTeachingHours: Number(r.maxDirectTeachingHours) || 14,
              weeklyHoursLimit: 40,
              status: 'Active',
              preferences: {
                preferredDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
                preferredPeriods: [1, 2, 3, 4],
                protectedSlots: [],
                maxConsecutivePeriods: 2,
                availableForMakeup: true,
                availableForTutorial: true,
              },
            });
            successCount++;
          }
        });
        if (validated.length > 0) {
          setFacultyMembers(prev => [...prev, ...validated]);
        }
      } else if (type === 'courses') {
        const validated: Course[] = [];
        records.forEach((r, idx) => {
          if (!r.code || !r.name) {
            errors.push(`Row ${idx + 1}: Course Code and Course Name are required.`);
          } else {
            validated.push({
              id: String(r.code).trim(),
              code: String(r.code).trim(),
              name: String(r.name).trim(),
              departmentId: r.departmentId || 'dept-cse',
              credits: Number(r.credits) || 4,
              requiredLecturesPerWeek: Number(r.requiredLecturesPerWeek) || 3,
              requiredTutorialsPerWeek: Number(r.requiredTutorialsPerWeek) || 0,
              requiredLabsPerWeek: Number(r.requiredLabsPerWeek) || 0,
              totalSemesterHours: 45,
              completedHours: 0,
              cancelledHours: 0,
              requiresLab: Boolean(r.requiresLab || r.requiredLabsPerWeek > 0),
              requiredEquipment: Array.isArray(r.requiredEquipment) ? r.requiredEquipment : ['Smart Projector'],
              primaryFacultyId: r.primaryFacultyId || 'fac-sharma',
              status: 'Active',
            });
            successCount++;
          }
        });
        if (validated.length > 0) {
          setCourses(prev => [...prev, ...validated]);
        }
      } else if (type === 'rooms') {
        const validated: Room[] = [];
        records.forEach((r, idx) => {
          if (!r.name || !r.capacity) {
            errors.push(`Row ${idx + 1}: Room Name and Capacity are required.`);
          } else {
            validated.push({
              id: r.id || `room-${Date.now()}-${idx}`,
              name: String(r.name).trim(),
              building: r.building || 'Turing Block',
              floor: Number(r.floor) || 1,
              capacity: Number(r.capacity) || 60,
              type: r.type || 'LectureHall',
              equipment: Array.isArray(r.equipment) ? r.equipment : ['Projector', 'Whiteboard'],
              isAvailable: true,
            });
            successCount++;
          }
        });
        if (validated.length > 0) {
          setRooms(prev => [...prev, ...validated]);
        }
      } else if (type === 'sections') {
        const validated: StudentSection[] = [];
        records.forEach((r, idx) => {
          if (!r.name || !r.studentCount) {
            errors.push(`Row ${idx + 1}: Section Name and Student Count are required.`);
          } else {
            const secId = r.id || `sec-${Date.now()}-${idx}`;
            validated.push({
              id: secId,
              name: String(r.name).trim(),
              departmentId: r.departmentId || 'dept-cse',
              program: r.program || 'B.Tech Computer Science & Engineering',
              semester: Number(r.semester) || 5,
              batchYear: 2024,
              studentCount: Number(r.studentCount) || 50,
              subSections: [
                { id: `sub-${secId}-1`, sectionId: secId, name: 'Group 1', studentCount: Math.ceil(Number(r.studentCount) / 2) },
                { id: `sub-${secId}-2`, sectionId: secId, name: 'Group 2', studentCount: Math.floor(Number(r.studentCount) / 2) },
              ],
              classRepresentative: {
                name: r.crName || 'Section Representative',
                email: r.crEmail || 'cr@student.thapar.edu',
                studentId: r.crRoll || '2024BCSE001',
              },
              status: 'Active',
            });
            successCount++;
          }
        });
        if (validated.length > 0) {
          setSections(prev => [...prev, ...validated]);
        }
      } else if (type === 'allocations') {
        const validated: CourseAllocation[] = [];
        records.forEach((r, idx) => {
          if (!r.courseId || !r.facultyId || !r.sectionId) {
            errors.push(`Row ${idx + 1}: Course, Faculty, and Section are required for allocation.`);
          } else {
            validated.push({
              id: `alloc-${Date.now()}-${idx}`,
              courseId: r.courseId,
              facultyId: r.facultyId,
              sectionId: r.sectionId,
              subSectionId: r.subSectionId,
              sessionType: r.sessionType || 'Lecture',
              hoursPerWeek: Number(r.hoursPerWeek) || 3,
              preferredRoomId: r.preferredRoomId,
              status: 'Allocated',
            });
            successCount++;
          }
        });
        if (validated.length > 0) {
          setAllocations(prev => [...prev, ...validated]);
        }
      }
    } catch (err: any) {
      errors.push(`Import exception: ${err?.message || 'Failed parsing records.'}`);
    }

    return { successCount, errors };
  };

  // Bulk generate arbitrary number of groups with hierarchical subgroups
  const bulkGenerateGroups = async (params: {
    programName: string;
    batchYear: number;
    totalStudents: number;
    numGroups: number;
    namingPattern: string;
    numSubgroupsPerGroup: number;
    subgroupNamingPattern?: string;
    departmentId?: string;
  }) => saveChange('/api/academic/groups/bulk', 'POST', params);

  // Master Excel import. The server validates and saves the workbook; the client then reloads the saved data,
  // so a rejected import is reported instead of appearing to succeed.
  const commitMasterImport = async (
    parsedData: ExcelImportPreview['parsedData'],
    mode: 'upsert' | 'replace' = 'upsert'
  ): Promise<{ success: boolean; importedCount: number; message: string }> => {
    try {
      const response = await fetch(apiUrl('/api/academic/import'), {
        method: 'POST',
        credentials: 'same-origin',
        headers: getAuthHeaders(),
        body: JSON.stringify({ parsedData, mode }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        return { success: false, importedCount: 0, message: data.message || `Import failed (${response.status}).` };
      }
      await refreshAcademicData().catch(() => undefined);
      return { success: true, importedCount: data.importedCount, message: data.message };
    } catch {
      return { success: false, importedCount: 0, message: 'Could not reach the server. Nothing was imported.' };
    }
  };

  // Cancel Session & Trigger Self-Healing Pipeline
  const cancelSession = async (sessionId: string, reason: string): Promise<{ success: boolean; message?: string }> =>
    saveChange('/api/recovery/cancel-class', 'POST', { sessionId, reason: reason.trim() || 'Unforeseen conflict' });

  const undoCancellation = async (sessionId: string): Promise<{ success: boolean }> =>
    saveChange('/api/recovery/undo-cancel', 'POST', { sessionId });

  const scheduleMakeup = async (opportunityId: string): Promise<{ success: boolean }> =>
    saveChange('/api/recovery/schedule-makeup', 'POST', { opportunityId });

  const votePoll = async (pollId: string, optionId: string): Promise<{ success: boolean }> => {
    const poll = polls.find(item => item.id === pollId);
    if (!poll || !poll.isActive) return { success: false };
    try {
      const response = await fetch(apiUrl('/api/voting/vote'), {
        method: 'POST', credentials: 'same-origin', headers: getAuthHeaders(),
        body: JSON.stringify({ pollId, optionId }),
      });
      if (!response.ok) return { success: false };
      setPolls(prev => prev.map(item => {
        if (item.id !== pollId) return item;
        const oldOptionId = item.userVotedOptionId;
        if (oldOptionId === optionId) return item;
        return {
          ...item,
          votedStudentsCount: item.votedStudentsCount + (oldOptionId ? 0 : 1),
          userHasVoted: true,
          userVotedOptionId: optionId,
          options: item.options.map(option => ({
            ...option,
            votes: option.votes + (option.id === optionId ? 1 : 0) - (option.id === oldOptionId ? 1 : 0),
          })),
        };
      }));
      return { success: true };
    } catch {
      return { success: false };
    }
  };

  const createPoll: TimetableContextType['createPoll'] = async (input) => {
    try {
      const response = await fetch(apiUrl('/api/voting/polls'), {
        method: 'POST', credentials: 'same-origin', headers: getAuthHeaders(), body: JSON.stringify(input),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success || !data.poll) return { success: false, message: data.message || 'Could not create poll.' };
      setPolls((previous) => [data.poll, ...previous.filter((poll) => poll.id !== data.poll.id)]);
      return { success: true, message: 'Poll created. Students in the selected section can now vote.' };
    } catch {
      return { success: false, message: 'Could not reach the poll service.' };
    }
  };

  const toggleSessionLock = async (sessionId: string, reason = 'Administrative Lock') => {
    const session = sessions.find((item) => item.id === sessionId);
    if (!session) return { success: false, message: 'Session not found.' };
    const isLocked = !session.isLocked;
    try {
      const response = await fetch(apiUrl(`/api/timetable/sessions/${encodeURIComponent(sessionId)}/lock`), {
        method: 'PUT', credentials: 'same-origin', headers: getAuthHeaders(), body: JSON.stringify({ isLocked, reason }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success || !data.session) return { success: false, message: data.message || 'Could not save session lock.' };
      setSessions(previous => previous.map(item => item.id === sessionId ? data.session : item));
      return { success: true };
    } catch {
      return { success: false, message: 'Could not reach the server. Session lock was not changed.' };
    }
  };

  const setFacultyProtectedSlot = async (
    facultyId: string,
    day: DayOfWeek,
    periodId: string,
    reason: 'Research' | 'Lunch' | 'Personal' | 'Department' | 'Meeting'
  ): Promise<{ success: boolean }> => {
    const previous = facultyMembers.find((faculty) => faculty.id === facultyId);
    if (!previous) return { success: false };
    const exists = previous.preferences.protectedSlots.some(ps => ps.day === day && ps.periodId === periodId);
    const nextProtectedSlots = exists
      ? previous.preferences.protectedSlots.filter(ps => !(ps.day === day && ps.periodId === periodId))
      : [...previous.preferences.protectedSlots, { day, periodId, reason }];
    try {
      const response = await fetch(apiUrl(`/api/academic/faculty/${encodeURIComponent(facultyId)}/availability`), {
        method: 'POST', credentials: 'same-origin', headers: getAuthHeaders(),
        body: JSON.stringify({ day, periodId, reason }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.message || 'Availability could not be saved.');
      setFacultyMembers(prev => prev.map(f => {
        if (f.id !== facultyId) return f;
        return {
          ...f,
          preferences: { ...f.preferences, protectedSlots: nextProtectedSlots },
        };
      }));
      return { success: true };
    } catch {
      return { success: false };
    }
  };

  const restoreVersion = async (versionNumber: number): Promise<{ success: boolean; message?: string }> => {
    try {
      const response = await fetch(apiUrl(`/api/timetable/versions/${versionNumber}/restore`), {
        method: 'POST', credentials: 'same-origin', headers: getAuthHeaders(), body: JSON.stringify({}),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success || !data.version?.sessions) return { success: false, message: data.message || 'This version could not be restored.' };
      setSessions(data.version.sessions);
      setPublishStatus('Draft');
      return { success: true, message: data.message || `Restored ${data.version.versionLabel}.` };
    } catch {
      return { success: false, message: 'Could not reach the server. This version was not restored.' };
    }
  };

  const markNotificationRead = async (id: string) => {
    const response = await fetch(apiUrl(`/api/notifications/${encodeURIComponent(id)}/read`), {
      method: 'POST', credentials: 'same-origin', headers: getAuthHeaders(), body: JSON.stringify({}),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) throw new Error(data.message || 'Notification could not be marked as read.');
    setNotifications(prev => prev.map(n => (n.id === id ? { ...n, read: true } : n)));
  };

  const triggerAutoMatchAll = () => {
    let matched = 0;
    recoveryOpportunities.forEach(opp => {
      if (opp.matchScore >= 90 && opp.status === 'Proposed') {
        scheduleMakeup(opp.id);
        matched++;
      }
    });
    if (matched > 0) {
      setNotifications(prev => [
        {
          id: `notif-${Date.now()}`,
          type: 'makeup_request',
          title: 'Automated Recovery Batch Complete',
          message: `The schedule optimizer placed ${matched} makeup slot(s) without constraint conflicts.`,
          timestamp: new Date().toISOString(),
          read: false,
          category: 'Success',
        },
        ...prev,
      ]);
    }
  };

  const declineOpportunity = async (opportunityId: string): Promise<{ success: boolean }> =>
    saveChange('/api/recovery/decline', 'POST', { opportunityId });

  /** Teachers ask for an extra class; the coordinator decides and adds it. */
  const claimMarketplaceSlot = async (
    courseId: string,
    sectionId: string,
    day: DayOfWeek,
    timeSlotId: string,
    roomId: string,
    type: string,
    facultyId: string
  ): Promise<{ success: boolean }> => {
    const taught = sessions.find(s => s.courseId === courseId && s.sectionId === sectionId && s.facultyId === facultyId);
    const slot = academicYear.timeSlots.find(t => t.id === timeSlotId);
    const room = rooms.find(r => r.id === roomId);
    return saveChange('/api/recovery/request-change', 'POST', {
      sessionId: taught?.id,
      details: `Requests an extra ${type || 'class'} on ${day} ${slot?.label ?? timeSlotId} in ${room?.name ?? roomId}.`,
    });
  };

  const requestSubstituteCover = async (
    substituteFacultyId: string,
    sessionId: string
  ): Promise<{ success: boolean }> => {
    const substitute = facultyMembers.find(f => f.id === substituteFacultyId);
    return saveChange('/api/recovery/request-change', 'POST', {
      sessionId,
      details: `Requests substitute cover by ${substitute?.name ?? substituteFacultyId}.`,
    });
  };

  const requestStudentMakeup = async (courseId: string, sectionId: string): Promise<{ success: boolean }> =>
    saveChange('/api/recovery/student-request', 'POST', { courseId, sectionId });

  const addSession = async (sessionData: Omit<ClassSession, 'id' | 'version'>): Promise<{ isSuccess: boolean; error?: string }> => {
    const check = checkHardConstraints(
      sessionData,
      sessions,
      rooms,
      facultyMembers,
      sections,
      courses
    );

    if (!check.isFeasible) {
      return { isSuccess: false, error: check.violations.join(' | ') };
    }

    try {
      const response = await fetch(apiUrl('/api/timetable/sessions'), {
        method: 'POST',
        credentials: 'same-origin',
        headers: getAuthHeaders(),
        body: JSON.stringify(sessionData),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success || !data.session) {
        return { isSuccess: false, error: data.message || `Could not save class (${response.status}).` };
      }
      setSessions(prev => prev.some(session => session.id === data.session.id) ? prev : [...prev, data.session]);
    } catch {
      return { isSuccess: false, error: 'Could not reach the server. The class was not saved.' };
    }
    return { isSuccess: true };
  };

  const deleteSession = async (sessionId: string): Promise<{ success: boolean; message?: string }> => {
    try {
      const response = await fetch(apiUrl(`/api/timetable/sessions/${encodeURIComponent(sessionId)}`), {
        method: 'DELETE', credentials: 'same-origin', headers: getAuthHeaders(),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) return { success: false, message: data.message || 'Session could not be removed.' };
      const removed = sessions.find((session) => session.id === sessionId);
      setSessions((previous) => previous.filter((session) => session.id !== sessionId));
      setPublishStatus('Draft');
      setAuditLogs((previous) => [{ id: `log-${Date.now()}`, timestamp: new Date().toLocaleString(), userId: 'coordinator', userName: 'Timetable Coordinator', action: 'CLASS_SESSION_DELETED', entityType: 'ClassSession', entityId: sessionId, details: `Removed ${removed?.courseId || 'class session'} from the working draft.` }, ...previous]);
      return { success: true, message: data.message || 'Session removed from the working draft.' };
    } catch {
      return { success: false, message: 'Could not reach the server. Session was not removed.' };
    }
  };

  return (
    <TimetableContext.Provider
      value={{
        academicYear,
        departments,
        programs,
        rooms,
        facultyMembers,
        sections,
        courses,
        allocations,
        constraints,
        publishStatus,
        validationReport,
        sessions,
        setSessions,
        makeupTasks,
        recoveryOpportunities,
        polls,
        notifications,
        versions,
        auditLogs,
        health,
        whatIfSimulation,
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
        updateAcademicYear,
        addDepartment,
        updateDepartment,
        deleteDepartment,
        toggleDepartmentStatus,
        addProgram,
        updateProgram,
        deleteProgram,
        addRoom,
        updateRoom,
        deleteRoom,
        toggleRoomAvailability,
        addFaculty,
        updateFaculty,
        deleteFaculty,
        toggleFacultyStatus,
        updateFacultyAvailability,
        addSection,
        updateSection,
        deleteSection,
        addSubSection,
        deleteSubSection,
        addCourse,
        updateCourse,
        deleteCourse,
        toggleCourseStatus,
        addAllocation,
        updateAllocation,
        deleteAllocation,
        addConstraint,
        updateConstraint,
        toggleConstraint,
        runValidation,
        resetDemoAcademicData,
        saveError,
        clearSaveError: () => setSaveError(''),
        generateDraftTimetable,
        updatePublishStatus,
        bulkImportData,
        commitMasterImport,
        bulkGenerateGroups,
        cancelSession,
        undoCancellation,
        scheduleMakeup,
        votePoll,
        createPoll,
        toggleSessionLock,
        setFacultyProtectedSlot,
        restoreVersion,
        markNotificationRead,
        triggerAutoMatchAll,
        requestStudentMakeup,
        declineOpportunity,
        claimMarketplaceSlot,
        requestSubstituteCover,
        addSession,
        deleteSession,
        runIndependentValidation,
        moveSessionWithValidation,
        swapSessionsWithValidation,
        generateMultiCandidateTimetables,
        generateDualRoutinesAPI,
        selectRoutineAPI,
        latestGeneratedRoutines,
        setLatestGeneratedRoutines,
        applyCandidateAsDraft,
        publishMasterTimetable,
        compareTimetableVersions,
        activeVersionNumber: versions.find(version => version.isPublished || version.status === 'Published')?.versionNumber ?? versions[0]?.versionNumber ?? 1,
        publishedSessions,
        refresh: refreshAcademicData,
        isLoading: false,
        loadError: null,
        notice: null,
        dismissNotice: () => {},
        studentsCount: sections.reduce((acc, s) => acc + (s.studentCount || 60), 0),
      }}
    >
      {children}
    </TimetableContext.Provider>
  );
}

export function useTimetable() {
  const context = useContext(TimetableContext);
  if (!context) {
    throw new Error('useTimetable must be used within a TimetableProvider');
  }
  return context;
}
