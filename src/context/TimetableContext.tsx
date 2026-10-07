import React, { createContext, useContext, useState, useMemo, useEffect } from 'react';
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
  GenerationRoutine
} from '../types';
import {
  validateTimetableIndependently,
  validateProposedSessionMove,
  validateProposedSessionSwap,
  IndependentValidationReport,
  ViolationDetail
} from '../lib/independentValidator';
import {
  executeOptimizationEngine,
  EngineOptions,
  GeneratedCandidate
} from '../lib/optimizationEngine';

import {
  calculateHealthScore,
  findSelfHealingRecoverySlots,
  checkHardConstraints
} from '../lib/recoveryEngine';
import { validateAcademicSetup, generateTimetableFromConfiguration } from '../lib/timetableGenerator';
import { ExcelImportPreview } from '../lib/excelMasterService';
import { apiUrl } from '../lib/apiConfig';
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
  simulatedSessions: ClassSession[];

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
  publishedSessions: ClassSession[];
  refresh: () => Promise<any> | any;
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
  deleteConstraint: (id: string) => Promise<{ success: boolean; message?: string }>;

  // Validation & Generation Engine
  runValidation: () => ValidationReport;
  resetDemoAcademicData: () => void;
  generateDraftTimetable: () => Promise<{
    isSuccess: boolean;
    sessionsGenerated: number;
    conflicts: string[];
    scheduledHours: number;
    totalHours: number;
  }>;
  updatePublishStatus: (status: TimetablePublishStatus, reviewerName?: string) => Promise<{ success: boolean }>;
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
  }) => Promise<StudentSection[]>;

  // Routine Timetable Operations
  cancelSession: (sessionId: string, reason: string) => Promise<{ success: boolean }>;
  scheduleMakeup: (opportunityId: string) => Promise<{ success: boolean }>;
  votePoll: (pollId: string, optionId: string) => Promise<{ success: boolean }>;
  toggleSessionLock: (sessionId: string, reason?: string) => Promise<{ success: boolean; message?: string }>;
  setFacultyProtectedSlot: (facultyId: string, day: DayOfWeek, periodId: string, reason: 'Research' | 'Lunch' | 'Personal' | 'Department' | 'Meeting') => Promise<{ success: boolean }>;
  restoreVersion: (versionNumber: number) => Promise<{ success: boolean; message?: string }>;
  runWhatIfSimulation: (scenarioId: string, title?: string) => Promise<{ success: boolean; message?: string; simulation?: WhatIfSimulation }>;
  applySimulation: (scenarioId: string, title?: string) => Promise<{ success: boolean; message?: string }>;
  markNotificationRead: (id: string) => Promise<{ success: boolean }>;
  triggerAutoMatchAll: () => void;
  requestStudentMakeup: (courseId: string, sectionId: string) => Promise<{ success: boolean }>;
  declineOpportunity: (opportunityId: string) => Promise<{ success: boolean }>;
  claimMarketplaceSlot: (courseId: string, sectionId: string, day: DayOfWeek, timeSlotId: string, roomId: string, type: string) => Promise<{ success: boolean }>;
  requestSubstituteCover: (substituteFacultyId: string, courseId: string, sectionId: string, day: DayOfWeek, timeSlotId: string) => Promise<{ success: boolean }>;
  addSession: (sessionData: Omit<ClassSession, 'id' | 'version'>) => Promise<{ isSuccess: boolean; error?: string }>;

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
  generateDualRoutinesAPI: (options?: { budgetMode?: EngineOptions['budgetMode']; timeBudgetMs?: number; maxCandidates?: number }) => Promise<GenerationResponse>;
  selectRoutineAPI: (versionNumber: number) => Promise<{ success: boolean; message?: string }>;
  latestGeneratedRoutines: GenerationRoutine[] | null;
  setLatestGeneratedRoutines: (routines: GenerationRoutine[] | null) => void;
  applyCandidateAsDraft: (candidate: GeneratedCandidate) => Promise<{ success: boolean; message?: string }>;
  publishMasterTimetable: (reviewerName?: string) => Promise<{ success: boolean; error?: string }>;
  unpublishMasterTimetable: () => Promise<{ success: boolean }>;
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

const EMPTY_ACADEMIC_YEAR: AcademicYearConfig = {
  id: 'runtime-academic-year',
  yearLabel: '',
  semesterType: 'Odd (Autumn)',
  semesterNumber: 1,
  workingDays: [],
  timeSlots: [],
  lunchPeriodId: '',
  publishStatus: 'Draft',
};

const EMPTY_WHAT_IF: WhatIfSimulation = {
  id: 'empty',
  title: '',
  scenarioType: 'RoomUnavailable',
  parameters: {},
  impact: {
    affectedClassesCount: 0,
    requiredRoomChanges: 0,
    newHardConflicts: 0,
    stabilityScore: 100,
    projectedHealthScore: 0,
    affectedFacultyNames: [],
    affectedSectionNames: [],
  },
  suggestedActions: [],
};

export function TimetableProvider({ children }: { children: React.ReactNode }) {
  // Master academic state
  const [academicYear, setAcademicYear] = useState<AcademicYearConfig>(EMPTY_ACADEMIC_YEAR);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [facultyMembers, setFacultyMembers] = useState<Faculty[]>([]);
  const [sections, setSections] = useState<StudentSection[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [allocations, setAllocations] = useState<CourseAllocation[]>([]);
  const [constraints, setConstraints] = useState<AcademicConstraint[]>([]);
  const [publishStatus, setPublishStatus] = useState<TimetablePublishStatus>('Draft');

  // Dynamic operational state
  const [sessions, setSessions] = useState<ClassSession[]>([]);
  const [makeupTasks, setMakeupTasks] = useState<MakeupTask[]>([]);
  const [recoveryOpportunities, setRecoveryOpportunities] = useState<RecoveryOpportunity[]>([]);
  const [polls, setPolls] = useState<StudentPoll[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [versions, setVersions] = useState<TimetableVersion[]>([]);
  const [whatIfSimulation, setWhatIfSimulation] = useState<WhatIfSimulation>(EMPTY_WHAT_IF);
  const [simulatedSessions, setSimulatedSessions] = useState<ClassSession[]>([]);

  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);


  const [currentRole, setCurrentRole] = useState<UserRole>('Coordinator');
  const [activeView, setActiveView] = useState<ViewTab>('overview');
  const [selectedFacultyId, setSelectedFacultyId] = useState<string>('');
  const [selectedSectionId, setSelectedSectionId] = useState<string>('');
  const [selectedRoomId, setSelectedRoomId] = useState<string>('');
  const [latestGeneratedRoutines, setLatestGeneratedRoutines] = useState<GenerationRoutine[] | null>(null);
  const [activeVersionNumber, setActiveVersionNumber] = useState<number | undefined>(undefined);
  const [publishedSessions, setPublishedSessions] = useState<ClassSession[]>([]);
  const [isLoadingState, setIsLoadingState] = useState(true);
  const [loadErrorState, setLoadErrorState] = useState<string | null>(null);
  const [noticeState, setNoticeState] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const getAuthHeaders = (): Record<string, string> => ({
    'Content-Type': 'application/json',
  });

  const getAuthHeadersAsync = async (): Promise<Record<string, string>> => ({
    'Content-Type': 'application/json',
  });

  const syncBootstrapData = async () => {
    setIsLoadingState(true);
    setLoadErrorState(null);
    try {
      const res = await fetch(apiUrl('/api/academic/bootstrap'), { credentials: 'include', headers: { Accept: 'application/json' } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) throw new Error(data.message || 'Could not refresh timetable data from the server.');
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
      if (Array.isArray(data.versions)) setVersions(data.versions);
      if (Number.isInteger(data.activeVersionNumber)) setActiveVersionNumber(data.activeVersionNumber);
      if (Array.isArray(data.notifications)) setNotifications(data.notifications);
      if (Array.isArray(data.makeupTasks)) setMakeupTasks(data.makeupTasks);
      if (Array.isArray(data.recoveryOpportunities)) setRecoveryOpportunities(data.recoveryOpportunities);
      if (Array.isArray(data.polls)) setPolls(data.polls);
      if (Array.isArray(data.publishedSessions)) setPublishedSessions(data.publishedSessions);
      if (Array.isArray(data.auditLogs)) setAuditLogs(data.auditLogs);
      if (data.publishStatus) setPublishStatus(data.publishStatus);
      if (typeof data.studentsCount === 'number') setStudentsCountFromServer(data.studentsCount);
      return data;
    } catch (err: any) {
      setLoadErrorState(err?.message || 'Could not load timetable data.');
      throw err;
    } finally {
      setIsLoadingState(false);
    }
  };

  const [studentsCountFromServer, setStudentsCountFromServer] = useState<number | undefined>(undefined);

  const { authStatus } = useAuth();
  useEffect(() => {
    if (authStatus !== 'AUTHENTICATED') {
      setIsLoadingState(false);
      return;
    }
    void syncBootstrapData().catch(() => {});
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
    return calculateHealthScore(sessions, rooms, facultyMembers, sections, courses);
  }, [sessions, rooms, facultyMembers, sections, courses]);

  const persistMutation = async (endpoint: string, method: string, body?: unknown) => {
    const res = await fetch(apiUrl(endpoint), {
      method,
      headers: getAuthHeaders(),
      credentials: 'include',
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
      throw new Error(data.message || 'The server rejected the change.');
    }
    return data;
  };

  // CRUD: Academic Year
  const updateAcademicYear = async (updates: Partial<AcademicYearConfig>) => {
    try {
      const data = await persistMutation('/api/academic/year', 'PATCH', updates);
      setAcademicYear(data.academicYear);
      return { success: true, message: 'Success' };
    } catch (err: any) {
      return { success: false, message: err?.message || 'Could not save academic year.' };
    }
  };

  // CRUD: Departments
  const addDepartment = async (dept: Omit<Department, 'id'>) => {
    try {
      const data = await persistMutation('/api/academic/departments', 'POST', dept);
      setDepartments(prev => [...prev, data.department]);
      return { success: true, message: 'Success' };
    } catch (err: any) { return { success: false, message: err?.message || 'Could not create department.' }; }
  };

  const updateDepartment = async (id: string, updates: Partial<Department>) => {
    try {
      const data = await persistMutation(`/api/academic/departments/${encodeURIComponent(id)}`, 'PUT', updates);
      setDepartments(prev => prev.map(d => d.id === id ? data.department : d));
      return { success: true, message: 'Success' };
    } catch (err: any) { return { success: false, message: err?.message || 'Could not update department.' }; }
  };

  const deleteDepartment = async (id: string) => {
    try {
      await persistMutation(`/api/academic/departments/${encodeURIComponent(id)}`, 'DELETE');
      setDepartments(prev => prev.filter(d => d.id !== id));
      return { success: true, message: 'Success' };
    } catch (err: any) { return { success: false, message: err?.message || 'Could not delete department.' }; }
  };

  const toggleDepartmentStatus = async (id: string) => {
    const dept = departments.find(d => d.id === id);
    if (!dept) return { success: false, message: 'Department not found.' };
    return updateDepartment(id, { status: dept.status === 'Active' ? 'Inactive' : 'Active' });
  };

  // CRUD: Programs
  const addProgram = async (prog: Omit<Program, 'id'>) => {
    try {
      const data = await persistMutation('/api/academic/programs', 'POST', prog);
      setPrograms(prev => [...prev, data.program]);
      return { success: true, message: 'Success' };
    } catch (err: any) { return { success: false, message: err?.message || 'Could not create program.' }; }
  };

  const updateProgram = async (id: string, updates: Partial<Program>) => {
    try {
      const data = await persistMutation(`/api/academic/programs/${encodeURIComponent(id)}`, 'PUT', updates);
      setPrograms(prev => prev.map(p => p.id === id ? data.program : p));
      return { success: true, message: 'Success' };
    } catch (err: any) { return { success: false, message: err?.message || 'Could not update program.' }; }
  };

  const deleteProgram = async (id: string) => {
    try {
      await persistMutation(`/api/academic/programs/${encodeURIComponent(id)}`, 'DELETE');
      setPrograms(prev => prev.filter(p => p.id !== id));
      return { success: true, message: 'Success' };
    } catch (err: any) { return { success: false, message: err?.message || 'Could not delete program.' }; }
  };

  // CRUD: Rooms
  const addRoom = async (room: Omit<Room, 'id'>) => {
    try {
      const data = await persistMutation('/api/academic/rooms', 'POST', room);
      setRooms(prev => [...prev, data.room]);
      return { success: true, message: 'Success' };
    } catch (err: any) { return { success: false, message: err?.message || 'Could not create room.' }; }
  };

  const updateRoom = async (id: string, updates: Partial<Room>) => {
    try {
      const data = await persistMutation(`/api/academic/rooms/${encodeURIComponent(id)}`, 'PUT', updates);
      setRooms(prev => prev.map(r => r.id === id ? data.room : r));
      return { success: true, message: 'Success' };
    } catch (err: any) { return { success: false, message: err?.message || 'Could not update room.' }; }
  };

  const deleteRoom = async (id: string) => {
    try {
      await persistMutation(`/api/academic/rooms/${encodeURIComponent(id)}`, 'DELETE');
      setRooms(prev => prev.filter(r => r.id !== id));
      return { success: true, message: 'Success' };
    } catch (err: any) { return { success: false, message: err?.message || 'Could not delete room.' }; }
  };

  const toggleRoomAvailability = async (id: string) => {
    const room = rooms.find(r => r.id === id);
    if (!room) return { success: false, message: 'Room not found.' };
    return updateRoom(id, { isAvailable: !room.isAvailable });
  };

  // CRUD: Faculty
  const addFaculty = async (fac: Omit<Faculty, 'id'>) => {
    try {
      const data = await persistMutation('/api/academic/faculty', 'POST', fac);
      setFacultyMembers(prev => [...prev, data.faculty]);
      return { success: true, message: 'Success' };
    } catch (err: any) { return { success: false, message: err?.message || 'Could not create faculty record.' }; }
  };

  const updateFaculty = async (id: string, updates: Partial<Faculty>) => {
    try {
      const data = await persistMutation(`/api/academic/faculty/${encodeURIComponent(id)}`, 'PUT', updates);
      setFacultyMembers(prev => prev.map(f => f.id === id ? data.faculty : f));
      return { success: true, message: 'Success' };
    } catch (err: any) { return { success: false, message: err?.message || 'Could not update faculty record.' }; }
  };

  const deleteFaculty = async (id: string) => {
    try {
      await persistMutation(`/api/academic/faculty/${encodeURIComponent(id)}`, 'DELETE');
      setFacultyMembers(prev => prev.filter(f => f.id !== id));
      return { success: true, message: 'Success' };
    } catch (err: any) { return { success: false, message: err?.message || 'Could not delete faculty record.' }; }
  };

  const toggleFacultyStatus = async (id: string) => {
    const fac = facultyMembers.find(f => f.id === id);
    if (!fac) return { success: false, message: 'Faculty record not found.' };
    return updateFaculty(id, { status: fac.status === 'Active' ? 'Inactive' : 'Active' });
  };

  const updateFacultyAvailability = async (id: string, preferences: Faculty['preferences']) => {
    return updateFaculty(id, { preferences });
  };

  // CRUD: Sections
  const addSection = async (sec: Omit<StudentSection, 'id'>) => {
    try {
      const data = await persistMutation('/api/academic/groups', 'POST', sec);
      setSections(prev => [...prev, data.section]);
      return { success: true, message: 'Success' };
    } catch (err: any) { return { success: false, message: err?.message || 'Could not create section.' }; }
  };

  const updateSection = async (id: string, updates: Partial<StudentSection>) => {
    try {
      const data = await persistMutation(`/api/academic/groups/${encodeURIComponent(id)}`, 'PUT', updates);
      setSections(prev => prev.map(s => s.id === id ? data.section : s));
      return { success: true, message: 'Success' };
    } catch (err: any) { return { success: false, message: err?.message || 'Could not update section.' }; }
  };

  const deleteSection = async (id: string) => {
    try {
      await persistMutation(`/api/academic/groups/${encodeURIComponent(id)}`, 'DELETE');
      setSections(prev => prev.filter(s => s.id !== id));
      return { success: true, message: 'Success' };
    } catch (err: any) { return { success: false, message: err?.message || 'Could not delete section.' }; }
  };

  const addSubSection = async (sectionId: string, subSec: Omit<SubSection, 'id' | 'sectionId'>) => {
    try {
      const data = await persistMutation('/api/academic/subgroups', 'POST', { groupId: sectionId, ...subSec });
      setSections(prev => prev.map(s => s.id === sectionId ? { ...s, subSections: [...(s.subSections || []), data.subgroup] } : s));
      return { success: true, message: 'Success' };
    } catch (err: any) { return { success: false, message: err?.message || 'Could not create subgroup.' }; }
  };

  const deleteSubSection = async (sectionId: string, subSecId: string) => {
    try {
      await persistMutation(`/api/academic/subgroups/${encodeURIComponent(sectionId)}/${encodeURIComponent(subSecId)}`, 'DELETE');
      setSections(prev => prev.map(s => s.id === sectionId ? { ...s, subSections: (s.subSections || []).filter(sub => sub.id !== subSecId) } : s));
      return { success: true, message: 'Success' };
    } catch (err: any) { return { success: false, message: err?.message || 'Could not delete subgroup.' }; }
  };

  // CRUD: Courses
  const addCourse = async (course: Omit<Course, 'id'>) => {
    try {
      const data = await persistMutation('/api/academic/courses', 'POST', course);
      setCourses(prev => [...prev, data.course]);
      return { success: true, message: 'Success' };
    } catch (err: any) { return { success: false, message: err?.message || 'Could not create course.' }; }
  };

  const updateCourse = async (id: string, updates: Partial<Course>) => {
    try {
      const data = await persistMutation(`/api/academic/courses/${encodeURIComponent(id)}`, 'PUT', updates);
      setCourses(prev => prev.map(c => c.id === id ? data.course : c));
      return { success: true, message: 'Success' };
    } catch (err: any) { return { success: false, message: err?.message || 'Could not update course.' }; }
  };

  const deleteCourse = async (id: string) => {
    try {
      await persistMutation(`/api/academic/courses/${encodeURIComponent(id)}`, 'DELETE');
      setCourses(prev => prev.filter(c => c.id !== id));
      return { success: true, message: 'Success' };
    } catch (err: any) { return { success: false, message: err?.message || 'Could not delete course.' }; }
  };

  const toggleCourseStatus = async (id: string) => {
    const course = courses.find(c => c.id === id);
    if (!course) return { success: false, message: 'Course not found.' };
    return updateCourse(id, { status: course.status === 'Active' ? 'Archived' : 'Active' });
  };

  // CRUD: Course Allocations
  const addAllocation = async (alloc: Omit<CourseAllocation, 'id' | 'status'>) => {
    try {
      const data = await persistMutation('/api/academic/allocations', 'POST', alloc);
      setAllocations(prev => [...prev, data.allocation]);
      return { success: true, message: 'Success' };
    } catch (err: any) { return { success: false, message: err?.message || 'Could not create allocation.' }; }
  };

  const updateAllocation = async (id: string, updates: Partial<CourseAllocation>) => {
    try {
      const data = await persistMutation(`/api/academic/allocations/${encodeURIComponent(id)}`, 'PUT', updates);
      setAllocations(prev => prev.map(a => a.id === id ? data.allocation : a));
      return { success: true, message: 'Success' };
    } catch (err: any) { return { success: false, message: err?.message || 'Could not update allocation.' }; }
  };

  const deleteAllocation = async (id: string) => {
    try {
      await persistMutation(`/api/academic/allocations/${encodeURIComponent(id)}`, 'DELETE');
      setAllocations(prev => prev.filter(a => a.id !== id));
      return { success: true, message: 'Success' };
    } catch (err: any) { return { success: false, message: err?.message || 'Could not delete allocation.' }; }
  };

  // CRUD: Constraints
  const addConstraint = async (constraint: Omit<AcademicConstraint, 'id'>) => {
    try {
      const res = await fetch(apiUrl('/api/constraints'), {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify(constraint),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success || !data.constraint) return { success: false, message: data.message || 'Constraint creation failed.' };
      setConstraints(prev => [...prev, data.constraint]);
      return { success: true, message: 'Success' };
    } catch {
      return { success: false, message: 'Network error saving constraint.' };
    }
  };

  const updateConstraint = async (id: string, updates: Partial<AcademicConstraint>) => {
    try {
      const res = await fetch(apiUrl(`/api/constraints/${encodeURIComponent(id)}`), {
        method: 'PATCH',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify(updates),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success || !data.constraint) return { success: false, message: data.message || 'Constraint update failed.' };
      setConstraints(prev => prev.map(c => c.id === id ? data.constraint : c));
      return { success: true, message: 'Success' };
    } catch {
      return { success: false, message: 'Network error saving constraint.' };
    }
  };

  const toggleConstraint = async (id: string) => {
    try {
      const res = await fetch(apiUrl(`/api/constraints/${encodeURIComponent(id)}/toggle`), {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success || !data.constraint) return { success: false, message: data.message || 'Constraint update failed.' };
      setConstraints(prev => prev.map(c => c.id === id ? data.constraint : c));
      return { success: true, message: 'Success' };
    } catch {
      return { success: false, message: 'Network error saving constraint.' };
    }
  };

  const deleteConstraint = async (id: string): Promise<{ success: boolean; message?: string }> => {
    try {
      const res = await fetch(apiUrl(`/api/constraints/${encodeURIComponent(id)}`), {
        method: 'DELETE',
        headers: getAuthHeaders(),
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) return { success: false, message: data.message || 'Constraint deletion failed.' };
      setConstraints(prev => prev.filter(c => c.id !== id));
      return { success: true, message: 'Success' };
    } catch {
      return { success: false, message: 'Network error deleting constraint.' };
    }
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
    const totalHours = allocations.reduce((sum, allocation) => sum + Number(allocation.hoursPerWeek || 0), 0);
    if (!report.isReadyForGeneration) {
      return {
        isSuccess: false,
        sessionsGenerated: 0,
        conflicts: report.items.filter(i => i.status === 'Error').map(i => i.message),
        scheduledHours: 0,
        totalHours: 0,
      };
    }

    const data = await generateDualRoutinesAPI({ budgetMode: 'FAST', timeBudgetMs: 1000, maxCandidates: 1 });
    const routine = data.routines?.[0];
    if (!data.success || !routine) {
      return {
        isSuccess: false,
        sessionsGenerated: 0,
        conflicts: data.message ? [data.message] : ['Timetable generation failed on the server.'],
        scheduledHours: 0,
        totalHours,
      };
    }

    const sessionsGenerated = routine.sessions.length;
    const hardViolations = routine.validation?.hardViolations ?? 0;
    const unscheduled = routine.validation?.unscheduled ?? 0;
    return {
      isSuccess: hardViolations === 0 && sessionsGenerated > 0,
      sessionsGenerated,
      conflicts: hardViolations === 0 ? [] : [`Generated timetable has ${hardViolations} hard constraint violation(s).`],
      scheduledHours: Math.max(0, totalHours - unscheduled),
      totalHours,
    };
  };


  // Publish Status Lifecycle
  const updatePublishStatus = async (status: TimetablePublishStatus, _reviewerName?: string): Promise<{ success: boolean }> => {
    try {
      let endpoint = '/api/timetable/review';
      let body: Record<string, unknown> = { status };

      if (status === 'Approved') {
        endpoint = '/api/timetable/approve';
        body = {};
      } else if (status === 'Published') {
        endpoint = '/api/timetable/publish';
        body = { versionId: activeVersionNumber };
      }

      const res = await fetch(apiUrl(endpoint), {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) return { success: false };
      await syncBootstrapData();
      return { success: true };
    } catch {
      return { success: false };
    }
  };


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
  ): Promise<{ success: boolean; error?: string }> => {
    const valResult = validateProposedSessionMove(sessions, sessionId, targetDay, targetTimeSlotId, targetRoomId, { academicYear, allocations, facultyMembers, rooms, sections, courses });
    if (!valResult.allowed) return { success: false, error: valResult.blockingReason || 'Cannot move session: would violate scheduling constraints.' };
    try {
      await persistMutation('/api/timetable/move', 'POST', { sessionId, targetDay, targetTimeSlotId, targetRoomId, reason });
      await syncBootstrapData();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Could not persist the timetable move.' };
    }
  };

  const swapSessionsWithValidation = async (
    sessionAId: string,
    sessionBId: string,
    reason = 'Manual Coordinator Swap'
  ): Promise<{ success: boolean; error?: string }> => {
    const valResult = validateProposedSessionSwap(sessions, sessionAId, sessionBId, { academicYear, allocations, facultyMembers, rooms, sections, courses });
    if (!valResult.allowed) return { success: false, error: valResult.blockingReason || 'Cannot swap sessions: results in a constraint violation.' };
    try {
      await persistMutation('/api/timetable/swap', 'POST', { sessionAId, sessionBId, reason });
      await syncBootstrapData();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Could not persist the timetable swap.' };
    }
  };

  const generateDualRoutinesAPI = async (
    options: { budgetMode?: EngineOptions['budgetMode']; timeBudgetMs?: number; maxCandidates?: number } = {},
  ): Promise<GenerationResponse> => {
    try {
      const headers = await getAuthHeadersAsync();
      const targetUrl = apiUrl('/api/academic/generate');
      const count = Math.min(5, Math.max(1, options.maxCandidates ?? 2));
      const profiles: GenerationRoutine['optimizationProfile'][] = ['STUDENT_FOCUSED', 'FACULTY_FOCUSED', 'BALANCED'];
      const routines = Array.from({ length: count }, (_, i) => ({
        id: `routine-${i + 1}`,
        label: i === 0 ? 'Student-focused' : i === 1 ? 'Faculty-focused' : `Balanced Option ${i + 1}`,
        optimizationProfile: profiles[i % profiles.length],
      }));

      const res = await fetch(targetUrl, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          budgetMode: options.budgetMode || 'BALANCED',
          timeBudgetMs: options.timeBudgetMs || 1000,
          routines,
        }),
      });

      const data = await res.json();
      if (data.success && data.routines && data.routines.length > 0) {
        setLatestGeneratedRoutines(data.routines);
        await syncBootstrapData();
      }
      return data;
    } catch (err: any) {
      console.warn('[TIMETABLE_API] Generate API failed:', err);
      return {
        success: false,
        isFeasible: false,
        routines: [],
        message: err?.message || 'Timetable generation service is unavailable. Check the server connection and try again.',
      };
    }
  };

  const selectRoutineAPI = async (versionNumber: number): Promise<{ success: boolean; message?: string }> => {
    try {
      const headers = await getAuthHeadersAsync();
      const res = await fetch(apiUrl('/api/timetable/select-routine'), {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ versionNumber }),
      });
      const data = await res.json();
      if (data.success && data.version?.sessions) {
        await syncBootstrapData();
      }
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

  const applyCandidateAsDraft = async (candidate: GeneratedCandidate): Promise<{ success: boolean; message?: string }> => {
    try {
      await persistMutation('/api/timetable/apply-candidate', 'POST', { sessions: candidate.sessions, reason: 'Candidate Selection' });
      await syncBootstrapData();
      return { success: true };
    } catch (err: any) {
      const message = err?.message || 'The server rejected the candidate timetable.';
      setNoticeState({ type: 'error', message });
      return { success: false, message };
    }
  };

  const publishMasterTimetable = async (reviewerName = 'Dean Academic Affairs'): Promise<{ success: boolean; error?: string }> => {
    const report = runIndependentValidation(sessions);
    if (!report.canPublish) {
      return {
        success: false,
        error: `Cannot publish: timetable has ${report.hardViolationsCount} hard constraint violations and ${report.requiredSessionsCount - report.scheduledSessionsCount} unscheduled hours.`,
      };
    }

    try {
      const activeVersion = versions.find((v) => v.versionNumber === (activeVersionNumber ?? versions[0]?.versionNumber));
      const resp = await fetch(apiUrl('/api/timetable/publish'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ versionId: activeVersion?.versionNumber }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data.success) {
        return { success: false, error: data.message || 'The server rejected publication.' };
      }

      await syncBootstrapData();
      return { success: true };
    } catch {
      return { success: false, error: 'Network error publishing timetable.' };
    }
  };


  const unpublishMasterTimetable = async (): Promise<{ success: boolean }> => {
    try {
      await persistMutation('/api/timetable/unpublish', 'POST');
      await syncBootstrapData();
      setNoticeState({ type: 'success', message: 'Timetable returned to draft mode and removed from live views.' });
      return { success: true };
    } catch (err: any) {
      const message = err?.message || 'Could not unpublish the timetable.';
      setNoticeState({ type: 'error', message });
      return { success: false };
    }
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

  const resetDemoAcademicData = () => {
    // Reload authoritative server data instead of restoring client-side fixtures.
    window.location.reload();
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
  }): Promise<StudentSection[]> => {
    try {
      const data = await persistMutation('/api/academic/groups/bulk', 'POST', params);
      await syncBootstrapData();
      const count = Array.isArray(data.sections) ? data.sections.length : 0;
      setNoticeState({ type: 'success', message: 'Generated ' + count + ' groups and saved them to the server.' });
      return Array.isArray(data.sections) ? data.sections : [];
    } catch (err: any) {
      setNoticeState({ type: 'error', message: err?.message || 'Could not generate groups.' });
      return [];
    }
  };

  // Transactional Master Excel Import
  const commitMasterImport = async (
    parsedData: ExcelImportPreview['parsedData'],
    mode: 'upsert' | 'replace' = 'upsert',
  ): Promise<{ success: boolean; importedCount: number; message: string }> => {
    try {
      const res = await fetch(apiUrl('/api/academic/import'), {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify({ parsedData, mode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        return {
          success: false,
          importedCount: Number(data.importedCount) || 0,
          message: data.message || 'Master import was rejected by the server.',
        };
      }
      await syncBootstrapData();
      return {
        success: true,
        importedCount: Number(data.importedCount) || 0,
        message: data.message || 'Master import completed successfully.',
      };
    } catch (err: any) {
      return {
        success: false,
        importedCount: 0,
        message: err?.message || 'Network error while importing the master workbook.',
      };
    }
  };

  const cancelSession = async (sessionId: string, reason: string): Promise<{ success: boolean }> => {
    try {
      const res = await fetch(apiUrl('/api/recovery/cancel-class'), {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify({ sessionId, reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) return { success: false };
      await syncBootstrapData();
      return { success: true };
    } catch {
      return { success: false };
    }
  };

  const scheduleMakeup = async (opportunityId: string): Promise<{ success: boolean }> => {
    try {
      const res = await fetch(apiUrl('/api/recovery/schedule-makeup'), {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify({ opportunityId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) return { success: false };
      await syncBootstrapData();
      return { success: true };
    } catch {
      return { success: false };
    }
  };

  const votePoll = async (pollId: string, optionId: string): Promise<{ success: boolean }> => {
    try {
      const res = await fetch(apiUrl('/api/voting/vote'), {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify({ pollId, optionId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) return { success: false };
      await syncBootstrapData();
      return { success: true };
    } catch {
      return { success: false };
    }
  };

  const toggleSessionLock = async (sessionId: string, reason = 'Administrative Lock'): Promise<{ success: boolean; message?: string }> => {
    try {
      const data = await persistMutation('/api/timetable/sessions/' + encodeURIComponent(sessionId) + '/lock', 'POST', { reason });
      if (data.session) setSessions(prev => prev.map(s => s.id === sessionId ? data.session : s));
      const message = data.session?.isLocked ? 'Session locked.' : 'Session unlocked.';
      setNoticeState({ type: 'success', message });
      return { success: true, message };
    } catch (err: any) {
      const message = err?.message || 'Could not change session lock state.';
      setNoticeState({ type: 'error', message });
      return { success: false, message };
    }
  };

  const setFacultyProtectedSlot = async (
    facultyId: string,
    day: DayOfWeek,
    periodId: string,
    reason: 'Research' | 'Lunch' | 'Personal' | 'Department' | 'Meeting'
  ): Promise<{ success: boolean }> => {
    try {
      const res = await fetch(apiUrl('/api/faculty/protected-slot'), {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify({ facultyId, day, periodId, reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) return { success: false };
      if (data.faculty) {
        setFacultyMembers(prev => prev.map(f => f.id === facultyId ? data.faculty : f));
      }
      return { success: true };
    } catch {
      return { success: false };
    }
  };

  const restoreVersion = async (versionNumber: number): Promise<{ success: boolean; message?: string }> => {
    try {
      await persistMutation('/api/timetable/versions/' + versionNumber + '/restore', 'POST');
      await syncBootstrapData();
      const message = 'Restored timetable version ' + versionNumber + '.';
      setNoticeState({ type: 'success', message });
      return { success: true, message };
    } catch (err: any) {
      const message = err?.message || 'Could not restore timetable version.';
      setNoticeState({ type: 'error', message });
      return { success: false, message };
    }
  };

  const runWhatIfSimulation = async (scenarioId: string, title?: string): Promise<{ success: boolean; message?: string; simulation?: WhatIfSimulation; sessions?: ClassSession[] }> => {
    try {
      const roomTarget = scenarioId === 'lab301-closure' ? rooms.find(r => r.type === 'ComputerLab' || r.type === 'HardwareLab') : rooms.find(r => r.type === 'LectureHall' || r.type === 'SeminarRoom');
      const facultyTarget = scenarioId === 'faculty-leave' ? facultyMembers.find(f => f.name.toLowerCase().includes('arvind sharma')) : undefined;
      const data = await persistMutation('/api/whatif/simulate', 'POST', { scenarioId, title: title || scenarioId, targetEntityId: facultyTarget?.id || roomTarget?.id, targetName: facultyTarget?.name || roomTarget?.name, timeBudgetMs: 1600 });
      if (data.simulation) setWhatIfSimulation(data.simulation);
      if (Array.isArray(data.sessions)) setSimulatedSessions(data.sessions);
      return { success: true, simulation: data.simulation, sessions: data.sessions };
    } catch (err: any) {
      const message = err?.message || 'What-If simulation failed.';
      setNoticeState({ type: 'error', message });
      return { success: false, message };
    }
  };

  const applySimulation = async (scenarioId: string, title?: string): Promise<{ success: boolean; message?: string }> => {
    try {
      const roomTarget = scenarioId === 'lab301-closure' ? rooms.find(r => r.type === 'ComputerLab' || r.type === 'HardwareLab') : rooms.find(r => r.type === 'LectureHall' || r.type === 'SeminarRoom');
      const facultyTarget = scenarioId === 'faculty-leave' ? facultyMembers.find(f => f.name.toLowerCase().includes('arvind sharma')) : undefined;
      const data = await persistMutation('/api/whatif/apply', 'POST', { scenarioId, title: title || scenarioId, targetEntityId: facultyTarget?.id || roomTarget?.id, targetName: facultyTarget?.name || roomTarget?.name, timeBudgetMs: 1600 });
      if (data.simulation) setWhatIfSimulation(data.simulation);
      if (Array.isArray(data.sessions)) setSimulatedSessions(data.sessions);
      await syncBootstrapData();
      const message = data.version ? 'What-If scenario applied as draft version ' + data.version.versionNumber + '.' : 'What-If scenario applied.';
      setNoticeState({ type: 'success', message });
      return { success: true, message };
    } catch (err: any) {
      const message = err?.message || 'Could not apply What-If scenario.';
      setNoticeState({ type: 'error', message });
      return { success: false, message };
    }
  };

  const markNotificationRead = async (id: string): Promise<{ success: boolean }> => {
    try {
      const res = await fetch(apiUrl(`/api/notifications/${encodeURIComponent(id)}/read`), {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) return { success: false };
      setNotifications(prev => prev.map(n => (n.id === id ? { ...n, read: true } : n)));
      return { success: true };
    } catch {
      return { success: false };
    }
  };

  const requestStudentMakeup = async (courseId: string, sectionId: string): Promise<{ success: boolean }> => {
    try {
      const res = await fetch(apiUrl('/api/recovery/request-makeup'), {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify({ message: `Student makeup request for ${courseId} / ${sectionId}` }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) return { success: false };
      await syncBootstrapData();
      return { success: true };
    } catch {
      return { success: false };
    }
  };

  const triggerAutoMatchAll = async () => {
    let matched = 0;
    for (const opp of recoveryOpportunities) {
      if (opp.matchScore < 90 || opp.status !== 'Proposed') continue;
      const result = await scheduleMakeup(opp.id);
      if (result.success) matched += 1;
    }
    return { success: matched > 0 };
  };

  const declineOpportunity = async (opportunityId: string): Promise<{ success: boolean }> => {
    try {
      const res = await fetch(apiUrl('/api/recovery/decline-opportunity'), {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify({ opportunityId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) return { success: false };
      await syncBootstrapData();
      return { success: true };
    } catch {
      return { success: false };
    }
  };

  const claimMarketplaceSlot = async (
    courseId: string,
    sectionId: string,
    day: DayOfWeek,
    timeSlotId: string,
    roomId: string,
    type: string,
  ): Promise<{ success: boolean }> => {
    const result = await addSession({
      courseId,
      facultyId: selectedFacultyId,
      sectionId,
      roomId,
      day,
      timeSlotId,
      type: (type || 'Lecture') as ClassSession['type'],
      status: 'Confirmed',
    });
    return { success: result.isSuccess };
  };

  const requestSubstituteCover = async (
    substituteFacultyId: string,
    courseId: string,
    sectionId: string,
    day: DayOfWeek,
    timeSlotId: string,
  ): Promise<{ success: boolean }> => {
    const substitute = facultyMembers.find(f => f.id === substituteFacultyId);
    const course = courses.find(c => c.id === courseId);
    try {
      const res = await fetch(apiUrl('/api/recovery/request-substitute'), {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify({
          message: `Requested ${substitute?.name || 'Faculty Member'} to cover ${course?.code || courseId} for ${sectionId} on ${day} ${timeSlotId}.`,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) return { success: false };
      await syncBootstrapData();
      return { success: true };
    } catch {
      return { success: false };
    }
  };

  const addSession = async (sessionData: Omit<ClassSession, 'id' | 'version'>): Promise<{ isSuccess: boolean; error?: string }> => {
    try {
      const res = await fetch(apiUrl('/api/timetable/sessions'), {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify(sessionData),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success || !data.session) return { isSuccess: false, error: data.message || 'Could not add session.' };
      await syncBootstrapData();
      return { isSuccess: true };
    } catch {
      return { isSuccess: false, error: 'Network error adding session.' };
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
        simulatedSessions,
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
        deleteConstraint,
        runValidation,
        resetDemoAcademicData,
        generateDraftTimetable,
        updatePublishStatus,
        bulkImportData,
        commitMasterImport,
        bulkGenerateGroups,
        cancelSession,
        scheduleMakeup,
        votePoll,
        toggleSessionLock,
        setFacultyProtectedSlot,
        restoreVersion,
        runWhatIfSimulation,
        applySimulation,
        markNotificationRead,
        triggerAutoMatchAll,
        requestStudentMakeup,
        declineOpportunity,
        claimMarketplaceSlot,
        requestSubstituteCover,
        addSession,
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
        unpublishMasterTimetable,
        compareTimetableVersions,
        activeVersionNumber,
        publishedSessions,
        refresh: syncBootstrapData,
        isLoading: isLoadingState,
        loadError: loadErrorState,
        notice: noticeState,
        dismissNotice: () => setNoticeState(null),
        studentsCount: studentsCountFromServer ?? sections.reduce((acc, s) => acc + (s.studentCount || 0), 0),
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
