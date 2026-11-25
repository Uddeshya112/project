import crypto from 'node:crypto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  Department,
  Program,
  Course,
  Faculty,
  Room,
  StudentSection,
  SubSection,
  CourseAllocation,
  AcademicConstraint,
  AcademicYearConfig,
  TimetableVersion,
  ClassSession,
  NotificationItem,
  AuditLog,
  MakeupTask,
  RecoveryOpportunity,
  StudentPoll,
  DayOfWeek,
  TimeSlot,
} from '../types';
import {
  INITIAL_ACADEMIC_YEAR,
  INITIAL_ALLOCATIONS,
  FACULTY_MEMBERS,
  ROOMS,
  SECTIONS,
  COURSES,
  DEPARTMENTS,
  PROGRAMS,
  STUDENTS,
  StudentRecord,
  INITIAL_CONSTRAINTS,
  INITIAL_SESSIONS,
  INITIAL_MAKEUP_TASKS,
  INITIAL_RECOVERY_OPPORTUNITIES,
  INITIAL_POLLS,
  INITIAL_NOTIFICATIONS,
  INITIAL_VERSIONS,
} from '../lib/initialData';
import {
  validateTimetableIndependently,
  validateProposedSessionMove,
  validateProposedSessionSwap,
} from '../lib/independentValidator';
import { facultyTeachingCap } from '../lib/facultyWorkload';
import { executeOptimizationEngine, type EngineResult, type GeneratedCandidate } from '../lib/optimizationEngine';
import { calculateHealthScore, checkHardConstraints, classBlock, consecutiveSlots, findSelfHealingRecoverySlots, periodLabel, sessionsClash } from '../lib/recoveryEngine';
import { ExcelImportPreview } from '../lib/excelMasterService';

// Initialize Supabase Client if environment variables are provided
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseKey =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  '';

export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

if (supabase) {
  console.info('[SUPABASE] Initialized server-side client connection to Supabase PostgreSQL at ' + supabaseUrl);
} else {
  console.info('[SUPABASE] Running in autonomous authoritative PostgreSQL emulation mode (configured schema ready for live cutover)');
}

export function shouldSeedDemoData(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.SEED_DEMO_DATA === 'true') return true;
  if (env.SEED_DEMO_DATA === 'false') return false;
  return env.NODE_ENV !== 'production';
}

/** The import payload is inconsistent. Thrown before anything is changed. */
export class ImportValidationError extends Error {}

const MAX_VERSIONS = 30;
const WEEK_ORDER: DayOfWeek[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Authoritative Supabase Relational Database Store
 * Implements transaction safety, relational foreign-key validation,
 * and immutable version history for the entire university system.
 */
class SupabaseRelationalStore {
  private academicYear: AcademicYearConfig = { ...INITIAL_ACADEMIC_YEAR };
  private departments: Map<string, Department> = new Map();
  private programs: Map<string, Program> = new Map();
  private courses: Map<string, Course> = new Map();
  private facultyMembers: Map<string, Faculty> = new Map();
  private rooms: Map<string, Room> = new Map();
  private groups: Map<string, StudentSection> = new Map();
  private students: Map<string, StudentRecord> = new Map();
  private allocations: Map<string, CourseAllocation> = new Map();
  private constraints: Map<string, AcademicConstraint> = new Map();
  private versions: TimetableVersion[] = [];
  private versionHealthCache = new WeakMap<TimetableVersion, { sessions: ClassSession[]; score: ReturnType<typeof calculateHealthScore> }>();
  private activeSessions: ClassSession[] = [];
  private notifications: NotificationItem[] = [];
  private auditEvents: AuditLog[] = [];
  private makeupTasks: MakeupTask[] = [];
  private recoveryOpportunities: RecoveryOpportunity[] = [];
  private replacementPolls: StudentPoll[] = [];
  private replacementVotes: Map<string, string> = new Map(); // "pollId:studentId" -> optionId

  constructor() {
    if (shouldSeedDemoData()) {
      this.seedInitialDatabase();
    } else {
      this.initializeEmptyDatabase();
    }
  }

  private initializeEmptyDatabase() {
    this.academicYear = {
      id: 'academic-year-unconfigured',
      yearLabel: 'Not configured',
      semesterType: 'Odd (Autumn)',
      semesterNumber: 1,
      workingDays: [],
      timeSlots: [],
      lunchPeriodId: '',
      publishStatus: 'Draft',
    };
    this.departments.clear();
    this.programs.clear();
    this.courses.clear();
    this.facultyMembers.clear();
    this.rooms.clear();
    this.groups.clear();
    this.students.clear();
    this.allocations.clear();
    this.constraints.clear();
    this.versions = [];
    this.activeSessions = [];
    this.notifications = [];
    this.auditEvents = [];
    this.makeupTasks = [];
    this.recoveryOpportunities = [];
    this.replacementPolls = [];
    this.replacementVotes.clear();
    console.info('[SUPABASE STORE] Empty production academic state initialized; no sample records loaded.');
  }

  /** Snapshot the live store so production writes can be committed to Postgres. */
  public exportPersistedState() {
    return {
      academicYear: this.academicYear,
      departments: [...this.departments.values()],
      programs: [...this.programs.values()],
      courses: [...this.courses.values()],
      facultyMembers: [...this.facultyMembers.values()],
      rooms: [...this.rooms.values()],
      groups: [...this.groups.values()],
      students: [...this.students.values()],
      allocations: [...this.allocations.values()],
      constraints: [...this.constraints.values()],
      versions: this.versions,
      activeSessions: this.activeSessions,
      notifications: this.notifications,
      auditEvents: this.auditEvents,
      makeupTasks: this.makeupTasks,
      recoveryOpportunities: this.recoveryOpportunities,
      replacementPolls: this.replacementPolls,
      replacementVotes: [...this.replacementVotes.entries()],
    };
  }

  /** Put back exactly the given snapshot. Unlike restorePersistedState, it repairs nothing. */
  public replaceState(snapshot: Record<string, any>) {
    const asMap = <T extends { id: string }>(items: unknown): Map<string, T> =>
      new Map((Array.isArray(items) ? items : []).filter((item): item is T => Boolean(item && typeof item.id === 'string')).map((item) => [item.id, item]));
    this.academicYear = snapshot.academicYear || { ...INITIAL_ACADEMIC_YEAR };
    this.departments = asMap<Department>(snapshot.departments);
    this.programs = asMap<Program>(snapshot.programs);
    this.courses = asMap<Course>(snapshot.courses);
    this.facultyMembers = asMap<Faculty>(snapshot.facultyMembers);
    this.rooms = asMap<Room>(snapshot.rooms);
    this.groups = asMap<StudentSection>(snapshot.groups);
    this.students = asMap<StudentRecord>(snapshot.students);
    this.allocations = asMap<CourseAllocation>(snapshot.allocations);
    this.constraints = asMap<AcademicConstraint>(snapshot.constraints);
    this.versions = Array.isArray(snapshot.versions) ? snapshot.versions : [];
    this.activeSessions = Array.isArray(snapshot.activeSessions) ? snapshot.activeSessions : [];
    this.notifications = Array.isArray(snapshot.notifications) ? snapshot.notifications : [];
    this.auditEvents = Array.isArray(snapshot.auditEvents) ? snapshot.auditEvents : [];
    this.makeupTasks = Array.isArray(snapshot.makeupTasks) ? snapshot.makeupTasks : [];
    this.recoveryOpportunities = Array.isArray(snapshot.recoveryOpportunities) ? snapshot.recoveryOpportunities : [];
    this.replacementPolls = Array.isArray(snapshot.replacementPolls) ? snapshot.replacementPolls : [];
    this.replacementVotes = new Map(Array.isArray(snapshot.replacementVotes) ? snapshot.replacementVotes : []);
  }

  /** Load a snapshot previously written by this store, repairing records written by older versions. */
  public restorePersistedState(snapshot: Record<string, any>) {
    this.replaceState(snapshot);
    for (const section of this.groups.values()) {
      const representative = [...this.students.values()].find((student) => student.sectionId === section.id);
      if (representative && (!section.classRepresentative?.name || /^CR\s/i.test(section.classRepresentative.name))) {
        section.classRepresentative = { name: representative.name, email: representative.email, studentId: representative.studentId };
      }
    }

    // Older persisted snapshots predate dedicated faculty demo records. Repair those
    // links on read so deployments do not require a destructive demo reset. Only the sample
    // dataset is repaired: imported and real institutions must not gain sample teachers.
    const isSampleDataset = this.facultyMembers.has('fac-0005') && this.facultyMembers.has('fac-0003');
    const ensureDemoFaculty = (id: string, email: string, name: string, sourceId: string) => {
      const existing = [...this.facultyMembers.values()].find((faculty) => faculty.email?.toLowerCase() === email);
      if (existing || !isSampleDataset) return;
      const template = this.facultyMembers.get(sourceId) || FACULTY_MEMBERS[0];
      const linked = { ...template, id, email, name, departmentId: 'dept-cse' };
      this.facultyMembers.set(id, linked);
    };
    ensureDemoFaculty('fac-demo-neha', 'faculty.demo@demo.thapar.local', 'Dr. Neha Agarwal', 'fac-0005');
    ensureDemoFaculty('fac-demo-hod', 'hod.demo@demo.thapar.local', 'Dr. Sunita Rao', 'fac-0003');
    ensureDemoFaculty('fac-demo-rajesh', 'coordinator.demo@demo.thapar.local', 'Prof. Rajesh Khanna', 'fac-0005');
    const repairDemoFacultyId = (facultyId: string) => !isSampleDataset ? facultyId : facultyId === 'fac-0005' ? 'fac-demo-neha' : facultyId === 'fac-0003' ? 'fac-demo-hod' : facultyId;
    this.activeSessions = this.activeSessions.map((session) => ({ ...session, facultyId: repairDemoFacultyId(session.facultyId) }));
    const publishedIndex = this.versions.findIndex((version) => version.isPublished || version.status === 'Published');
    const activePublishedIndex = this.academicYear.publishStatus === 'Published'
      ? (publishedIndex >= 0 ? publishedIndex : this.versions.length - 1)
      : -1;
    this.versions = this.versions.map((version, index) => ({
      ...version,
      isPublished: this.academicYear.publishStatus === 'Published' ? index === activePublishedIndex : version.isPublished,
      status: this.academicYear.publishStatus === 'Published'
        ? (index === activePublishedIndex ? 'Published' : (version.status === 'Published' ? 'Approved' : version.status))
        : version.status,
      sessions: (version.sessions || []).map((session) => ({ ...session, facultyId: repairDemoFacultyId(session.facultyId) })),
    }));
    if (this.academicYear.publishStatus === 'Published' && this.activeSessions.length === 0) {
      const publishedVersion = this.versions.find((version) => version.isPublished || version.status === 'Published');
      if (publishedVersion?.sessions?.length) this.activeSessions = [...publishedVersion.sessions];
    }
    const seenNotificationKeys = new Set<string>();
    this.notifications = this.notifications.filter((item) => {
      const key = item.title === 'Master Schedule Published'
        ? item.title
        : `${item.title}|${item.actionPayload?.sessionId || item.actionPayload?.sectionId || item.id}`;
      if (seenNotificationKeys.has(key)) return false;
      seenNotificationKeys.add(key);
      return true;
    });
    this.allocations = new Map([...this.allocations.values()].map((allocation) => [allocation.id, { ...allocation, facultyId: repairDemoFacultyId(allocation.facultyId) }]));
  }

  /**
   * Seed the relational database with institutional baseline records
   */
  public seedInitialDatabase() {
    // 1. Departments
    this.departments.clear();
    DEPARTMENTS.forEach(d => this.departments.set(d.id, { ...d }));

    // 2. Programs
    this.programs.clear();
    PROGRAMS.forEach(p => this.programs.set(p.id, { ...p }));

    // 3. Faculty
    this.facultyMembers.clear();
    FACULTY_MEMBERS.forEach(f => this.facultyMembers.set(f.id, { ...f }));
    const demoNehaTemplate = this.facultyMembers.get('fac-0005') || FACULTY_MEMBERS[0];
    const demoHodTemplate = this.facultyMembers.get('fac-0003') || FACULTY_MEMBERS[1];
    this.facultyMembers.set('fac-demo-neha', {
      ...demoNehaTemplate,
      id: 'fac-demo-neha',
      name: 'Dr. Neha Agarwal',
      email: 'faculty.demo@demo.thapar.local',
      departmentId: 'dept-cse',
    });
    this.facultyMembers.set('fac-demo-hod', {
      ...demoHodTemplate,
      id: 'fac-demo-hod',
      name: 'Dr. Sunita Rao',
      email: 'hod.demo@demo.thapar.local',
      departmentId: 'dept-cse',
    });
    this.facultyMembers.set('fac-demo-rajesh', {
      ...demoNehaTemplate,
      id: 'fac-demo-rajesh',
      name: 'Prof. Rajesh Khanna',
      email: 'coordinator.demo@demo.thapar.local',
      departmentId: 'dept-cse',
    });

    // 4. Rooms
    this.rooms.clear();
    ROOMS.forEach(r => this.rooms.set(r.id, { ...r }));

    // 5. Courses
    this.courses.clear();
    COURSES.forEach(c => this.courses.set(c.id, { ...c }));

    // 6. Groups & Subgroups
    this.groups.clear();
    SECTIONS.forEach(s => {
      // Ensure subgroups exist with standard A1, A2 structure if undefined
      const subSections: SubSection[] = s.subSections && s.subSections.length > 0
        ? s.subSections
        : [
            { id: `sub-${s.id}-1`, sectionId: s.id, name: '1', studentCount: Math.ceil(s.studentCount / 2), type: 'Lab' },
            { id: `sub-${s.id}-2`, sectionId: s.id, name: '2', studentCount: Math.floor(s.studentCount / 2), type: 'Lab' },
          ];
      this.groups.set(s.id, { ...s, subSections });
    });

    // 6b. Students Roster (1,280 Students)
    this.students.clear();
    STUDENTS.forEach(st => this.students.set(st.id, { ...st }));
    this.students.set('stu-demo-student', {
      id: 'stu-demo-student',
      studentId: '102303999',
      name: 'Rohan Sharma',
      email: 'student.demo@demo.thapar.local',
      programCode: 'BTECH-CSE',
      batchYear: 2024,
      semester: 5,
      sectionId: 'sec-cse-a',
      sectionName: 'CSE-A',
      subSectionId: 'sub-sec-cse-a-1',
      subSectionName: 'A1',
    });

    // 7. Allocations
    this.allocations.clear();
    INITIAL_ALLOCATIONS.forEach(a => this.allocations.set(a.id, { ...a }));

    // 8. Constraints
    this.constraints.clear();
    INITIAL_CONSTRAINTS.forEach(c => this.constraints.set(c.id, { ...c }));

    // 9. Timetable Versions & Sessions
    const linkDemoFaculty = (session: ClassSession): ClassSession => ({
      ...session,
      facultyId: session.facultyId === 'fac-0005'
        ? 'fac-demo-neha'
        : session.facultyId === 'fac-0003'
          ? 'fac-demo-hod'
          : session.facultyId,
    });
    this.activeSessions = INITIAL_SESSIONS.map(linkDemoFaculty);
    this.versions = INITIAL_VERSIONS.map((version) => ({ ...version, sessions: version.sessions.map(linkDemoFaculty) }));

    // 10. Notifications & Tasks
    this.notifications = [...INITIAL_NOTIFICATIONS];
    this.makeupTasks = [...INITIAL_MAKEUP_TASKS];
    this.recoveryOpportunities = [...INITIAL_RECOVERY_OPPORTUNITIES];
    this.replacementPolls = [...INITIAL_POLLS];
    this.replacementVotes.clear();

    // 11. Initial Audit Log
    this.auditEvents = [
      {
        id: `audit-init-${Date.now()}`,
        timestamp: new Date().toISOString(),
        userId: 'system',
        userName: 'System Bootstrapper',
        action: 'DATABASE_BOOTSTRAPPED',
        entityType: 'Institution',
        entityId: 'inst-thapar',
        details: `Seeded Thapar Institute relational database with ${this.departments.size} departments, ${this.courses.size} courses, ${this.facultyMembers.size} faculty, ${this.rooms.size} rooms, ${this.groups.size} groups, and ${this.allocations.size} allocations.`,
      },
    ];

    console.info('[SUPABASE STORE] Relational master dataset successfully initialized.');
  }

  // --------------------------------------------------------------------------
  // MASTER DATA QUERIES
  // --------------------------------------------------------------------------

  public getBootstrapState(userId?: string) {
    const publishedVersion = this.versions.find((version) => version.isPublished || version.status === 'Published');
    const versions = this.versions.map((version) => {
      const versionSessions = version.sessions || [];
      let cached = this.versionHealthCache.get(version);
      if (!cached || cached.sessions !== versionSessions) {
        cached = {
          sessions: versionSessions,
          score: calculateHealthScore(versionSessions, [...this.rooms.values()], [...this.facultyMembers.values()], [...this.groups.values()], [...this.courses.values()], this.academicYear),
        };
        this.versionHealthCache.set(version, cached);
      }
      const score = cached.score;
      // Clients list versions but never need their classes; sending every copy on each refresh grew to megabytes.
      return { ...version, sessions: [] as ClassSession[], sessionsCount: versionSessions.length, healthScore: score.overallScore, hardViolationsCount: score.hardConstraintViolations };
    });
    return {
      academicYear: this.academicYear,
      departments: Array.from(this.departments.values()),
      programs: Array.from(this.programs.values()),
      courses: Array.from(this.courses.values()),
      facultyMembers: Array.from(this.facultyMembers.values()),
      rooms: Array.from(this.rooms.values()),
      sections: Array.from(this.groups.values()),
      studentsCount: this.students.size,
      students: Array.from(this.students.values()).slice(0, 100), // First 100 for fast payload
      allocations: Array.from(this.allocations.values()),
      constraints: Array.from(this.constraints.values()),
      sessions: this.activeSessions,
      publishedSessions: publishedVersion
        ? (this.academicYear.publishStatus === 'Published' && this.activeSessions.length ? this.activeSessions : publishedVersion.sessions || [])
        : [],
      versions,
      notifications: this.notifications,
      makeupTasks: this.makeupTasks,
      recoveryOpportunities: this.recoveryOpportunities,
      polls: this.replacementPolls.map((poll) => {
        const vote = userId ? this.replacementVotes.get(`${poll.id}:${userId}`) : undefined;
        return { ...poll, userHasVoted: Boolean(vote), userVotedOptionId: vote };
      }),
      auditLogs: this.auditEvents,
      publishStatus: this.academicYear.publishStatus,
    };
  }

  public validateCurrentTimetable() {
    return validateTimetableIndependently(this.activeSessions, {
      academicYear: this.academicYear,
      allocations: Array.from(this.allocations.values()),
      facultyMembers: Array.from(this.facultyMembers.values()),
      rooms: Array.from(this.rooms.values()),
      sections: Array.from(this.groups.values()),
      courses: Array.from(this.courses.values()),
      constraints: Array.from(this.constraints.values()),
    });
  }

  public recordDepartmentApproval(departmentId: string, versionId: string, reviewerName = 'Department Head') {
    const timestamp = new Date().toISOString();
    this.logAudit(reviewerName, 'HOD_DEPARTMENT_SIGNED_OFF', 'DepartmentTimetable', `${departmentId}:${versionId}`,
      `Department ${departmentId} signed off timetable ${versionId}.`);
    return { timestamp };
  }

  public getAcademicState() {
    return {
      academicYear: this.academicYear,
      allocations: Array.from(this.allocations.values()),
      facultyMembers: Array.from(this.facultyMembers.values()),
      rooms: Array.from(this.rooms.values()),
      sections: Array.from(this.groups.values()),
      courses: Array.from(this.courses.values()),
      constraints: Array.from(this.constraints.values()),
    };
  }

  /** Looks in the full roster; getBootstrapState only carries the first 100 students. */
  public findStudentByEmail(email?: string): StudentRecord | undefined {
    const wanted = email?.trim().toLowerCase();
    if (!wanted) return undefined;
    return [...this.students.values()].find((student) => student.email?.toLowerCase() === wanted);
  }

  public findFaculty(id?: string, email?: string): Faculty | undefined {
    const byId = id ? this.facultyMembers.get(id) : undefined;
    if (byId) return byId;
    const wanted = email?.trim().toLowerCase();
    return wanted ? [...this.facultyMembers.values()].find((faculty) => faculty.email?.toLowerCase() === wanted) : undefined;
  }

  public hasSection(id: string): boolean {
    return this.groups.has(id);
  }

  public queryStudents(page = 1, limit = 20, search = '', sectionId?: string, departmentId?: string) {
    let all = Array.from(this.students.values());
    if (departmentId) {
      const departmentSections = new Set([...this.groups.values()].filter((section) => section.departmentId === departmentId).map((section) => section.id));
      all = all.filter((student) => departmentSections.has(student.sectionId));
    }
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      all = all.filter(s =>
        s.studentId.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q) ||
        s.sectionName.toLowerCase().includes(q)
      );
    }
    if (sectionId && sectionId !== 'ALL') {
      all = all.filter(s => s.sectionId === sectionId || s.sectionName === sectionId);
    }

    const total = all.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const startIndex = (page - 1) * limit;
    const data = all.slice(startIndex, startIndex + limit);

    return {
      total,
      page,
      limit,
      totalPages,
      students: data
    };
  }

  // --------------------------------------------------------------------------
  // CRUD OPERATIONS WITH RELATIONAL VALIDATION & AUDITING
  // --------------------------------------------------------------------------

  // Departments
  /** A readable id that no other record has. */
  private freeId(prefix: string, name: string, taken: ReadonlyMap<string, unknown>): string {
    const base = `${prefix}-${name.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    let id = base;
    for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
    return id;
  }

  private assertNew<T>(records: Iterable<T>, key: (item: T) => string, value: string, label: string) {
    for (const item of records) {
      if (key(item).trim().toUpperCase() === value.trim().toUpperCase()) throw new Error(`${label} ${value} already exists.`);
    }
  }

  public createDepartment(dept: Omit<Department, 'id'>, userId = 'coordinator'): Department {
    this.assertNew(this.departments.values(), (item) => item.code, dept.code, 'Department');
    const id = this.freeId('dept', dept.code, this.departments);
    const newDept: Department = { ...dept, id };
    this.departments.set(id, newDept);

    this.logAudit(userId, 'CREATE_DEPARTMENT', 'Department', id, `Created department ${newDept.name} (${newDept.code})`);
    return newDept;
  }

  public updateDepartment(id: string, updates: Partial<Department>, userId = 'coordinator'): Department {
    const existing = this.departments.get(id);
    if (!existing) throw new Error(`Department with ID ${id} not found.`);
    const updated = { ...existing, ...updates, id };
    this.departments.set(id, updated);

    this.logAudit(userId, 'UPDATE_DEPARTMENT', 'Department', id, `Updated department ${updated.code}`);
    return updated;
  }

  /** Deleting a record that classes, allocations or students still use would leave holes in the timetable people see. */
  private assertUnused(record: string, uses: (item: ClassSession | CourseAllocation) => boolean, students = 0) {
    const published = this.versions.find((version) => version.isPublished)?.sessions ?? [];
    const classes = Math.max(this.activeSessions.filter(uses).length, published.filter(uses).length);
    const allocations = [...this.allocations.values()].filter(uses).length;
    const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;
    const used = [
      classes > 0 && count(classes, 'scheduled period'),
      allocations > 0 && count(allocations, 'course allocation'),
      students > 0 && count(students, 'student'),
    ].filter(Boolean);
    if (used.length > 0) throw new Error(`Cannot delete this ${record}: ${used.join(', ')} still use it.`);
  }

  public deleteDepartment(id: string, userId = 'coordinator'): boolean {
    const hasPrograms = Array.from(this.programs.values()).some(p => p.departmentId === id);
    if (hasPrograms) {
      throw new Error('Cannot delete department: Child programs are assigned to it.');
    }
    const res = this.departments.delete(id);
    this.logAudit(userId, 'DELETE_DEPARTMENT', 'Department', id, `Archived department ${id}`);
    return res;
  }

  // Programs
  public createProgram(prog: Omit<Program, 'id'>, userId = 'coordinator'): Program {
    this.assertNew(this.programs.values(), (item) => item.code, prog.code, 'Program');
    const id = this.freeId('prog', prog.code, this.programs);
    const newProg: Program = { ...prog, id };
    this.programs.set(id, newProg);

    this.logAudit(userId, 'CREATE_PROGRAM', 'Program', id, `Created program ${newProg.name} (${newProg.code})`);
    return newProg;
  }

  public updateProgram(id: string, updates: Partial<Program>, userId = 'coordinator'): Program {
    const existing = this.programs.get(id);
    if (!existing) throw new Error(`Program with ID ${id} not found.`);
    const updated = { ...existing, ...updates, id };
    this.programs.set(id, updated);

    this.logAudit(userId, 'UPDATE_PROGRAM', 'Program', id, `Updated program ${updated.code}`);
    return updated;
  }

  public deleteProgram(id: string, userId = 'coordinator'): boolean {
    const program = this.programs.get(id);
    if ([...this.groups.values()].some((group) => group.program === program?.code || group.program === program?.name)) {
      throw new Error('Cannot delete program: groups are assigned to it.');
    }
    const res = this.programs.delete(id);
    this.logAudit(userId, 'DELETE_PROGRAM', 'Program', id, `Deleted program ${id}`);
    return res;
  }

  // Courses
  public createCourse(crs: Omit<Course, 'id'>, userId = 'coordinator'): Course {
    this.assertNew(this.courses.values(), (item) => item.code, crs.code, 'Course');
    const id = this.freeId('course', crs.code, this.courses);
    const newCourse: Course = { ...crs, id };
    this.courses.set(id, newCourse);

    this.logAudit(userId, 'CREATE_COURSE', 'Course', id, `Registered course ${newCourse.code} - ${newCourse.name}`);
    return newCourse;
  }

  public updateCourse(id: string, updates: Partial<Course>, userId = 'coordinator'): Course {
    const existing = this.courses.get(id);
    if (!existing) throw new Error(`Course with ID ${id} not found.`);
    const updated = { ...existing, ...updates, id };
    this.courses.set(id, updated);

    this.logAudit(userId, 'UPDATE_COURSE', 'Course', id, `Updated course ${updated.code}`);
    return updated;
  }

  public deleteCourse(id: string, userId = 'coordinator'): boolean {
    this.assertUnused('course', (item) => item.courseId === id);
    const res = this.courses.delete(id);
    this.logAudit(userId, 'DELETE_COURSE', 'Course', id, `Archived course ${id}`);
    return res;
  }

  // Faculty
  public createFaculty(fac: Omit<Faculty, 'id'>, userId = 'coordinator'): Faculty {
    this.assertNew(this.facultyMembers.values(), (item) => item.email, fac.email, 'A teacher with the email');
    const id = this.freeId('fac', fac.email.split('@')[0], this.facultyMembers);
    const newFaculty: Faculty = { ...fac, maxDirectTeachingHours: facultyTeachingCap({ ...fac, id } as Faculty), id };
    this.facultyMembers.set(id, newFaculty);

    this.logAudit(userId, 'CREATE_FACULTY', 'Faculty', id, `Added faculty member ${newFaculty.name} (${newFaculty.email})`);
    return newFaculty;
  }

  public updateFaculty(id: string, updates: Partial<Faculty>, userId = 'coordinator'): Faculty {
    const existing = this.facultyMembers.get(id);
    if (!existing) throw new Error(`Faculty with ID ${id} not found.`);
    const updated = { ...existing, ...updates, id };
    updated.maxDirectTeachingHours = facultyTeachingCap(updated);
    this.facultyMembers.set(id, updated);

    this.logAudit(userId, 'UPDATE_FACULTY', 'Faculty', id, `Updated faculty profile for ${updated.name}`);
    return updated;
  }

  public deleteFaculty(id: string, userId = 'coordinator'): boolean {
    this.assertUnused('teacher', (item) => item.facultyId === id);
    const res = this.facultyMembers.delete(id);
    this.logAudit(userId, 'DELETE_FACULTY', 'Faculty', id, `Removed faculty ${id}`);
    return res;
  }

  // Rooms
  public createRoom(room: Omit<Room, 'id'>, userId = 'coordinator'): Room {
    this.assertNew(this.rooms.values(), (item) => item.name, room.name, 'Room');
    const id = this.freeId('room', room.name, this.rooms);
    const newRoom: Room = { ...room, id };
    this.rooms.set(id, newRoom);

    this.logAudit(userId, 'CREATE_ROOM', 'Room', id, `Added room ${newRoom.name} (${newRoom.building}, cap: ${newRoom.capacity})`);
    return newRoom;
  }

  public updateRoom(id: string, updates: Partial<Room>, userId = 'coordinator'): Room {
    const existing = this.rooms.get(id);
    if (!existing) throw new Error(`Room with ID ${id} not found.`);
    const updated = { ...existing, ...updates, id };
    this.rooms.set(id, updated);

    this.logAudit(userId, 'UPDATE_ROOM', 'Room', id, `Updated room ${updated.name}`);
    return updated;
  }

  public deleteRoom(id: string, userId = 'coordinator'): boolean {
    this.assertUnused('room', (item) => 'roomId' in item && item.roomId === id);
    const res = this.rooms.delete(id);
    this.logAudit(userId, 'DELETE_ROOM', 'Room', id, `Removed room ${id}`);
    return res;
  }

  // Groups & Subgroups
  public createGroup(grp: Omit<StudentSection, 'id'>, userId = 'coordinator'): StudentSection {
    this.assertNew(this.groups.values(), (item) => item.name, grp.name, 'Group');
    const id = this.freeId('sec', grp.name, this.groups);
    const subSections: SubSection[] = grp.subSections && grp.subSections.length > 0
      ? grp.subSections
      : [
          { id: `sub-${id}-1`, sectionId: id, name: '1', studentCount: Math.ceil(grp.studentCount / 2), type: 'Lab' },
          { id: `sub-${id}-2`, sectionId: id, name: '2', studentCount: Math.floor(grp.studentCount / 2), type: 'Lab' },
        ];
    const newGroup: StudentSection = { ...grp, id, subSections };
    this.groups.set(id, newGroup);

    this.logAudit(userId, 'CREATE_GROUP', 'StudentSection', id, `Created student cohort ${newGroup.name} with ${subSections.length} subgroups`);
    return newGroup;
  }

  public updateGroup(id: string, updates: Partial<StudentSection>, userId = 'coordinator'): StudentSection {
    const existing = this.groups.get(id);
    if (!existing) throw new Error(`Group with ID ${id} not found.`);
    const updated = { ...existing, ...updates, id };
    this.groups.set(id, updated);

    this.logAudit(userId, 'UPDATE_GROUP', 'StudentSection', id, `Updated cohort ${updated.name}`);
    return updated;
  }

  public deleteGroup(id: string, userId = 'coordinator'): boolean {
    this.assertUnused('group', (item) => item.sectionId === id, [...this.students.values()].filter((student) => student.sectionId === id).length);
    const res = this.groups.delete(id);
    this.logAudit(userId, 'DELETE_GROUP', 'StudentSection', id, `Removed cohort ${id}`);
    return res;
  }

  public addSubgroup(groupId: string, name: string, studentCount?: number, type: 'Lab' | 'Tutorial' = 'Lab', userId = 'coordinator'): SubSection {
    const group = this.groups.get(groupId);
    if (!group) throw new Error(`Group ${groupId} not found`);

    this.assertNew(group.subSections || [], (item) => item.name, name, 'Subgroup');
    const subId = this.freeId(`sub-${groupId}`, name, new Map((group.subSections || []).map((item) => [item.id, item])));
    const newSub: SubSection = {
      id: subId,
      sectionId: groupId,
      name,
      studentCount: studentCount || Math.ceil(group.studentCount / ((group.subSections?.length || 1) + 1)),
      type,
    };

    group.subSections = [...(group.subSections || []), newSub];
    this.groups.set(groupId, group);

    this.logAudit(userId, 'ADD_SUBGROUP', 'SubSection', subId, `Added subgroup ${name} to group ${group.name}`);
    return newSub;
  }

  public deleteSubgroup(groupId: string, subgroupId: string, userId = 'coordinator'): boolean {
    const group = this.groups.get(groupId);
    if (!group) return false;

    this.assertUnused('subgroup', (item) => item.subSectionId === subgroupId, [...this.students.values()].filter((student) => student.subSectionId === subgroupId).length);
    group.subSections = (group.subSections || []).filter(s => s.id !== subgroupId);
    this.groups.set(groupId, group);

    this.logAudit(userId, 'DELETE_SUBGROUP', 'SubSection', subgroupId, `Removed subgroup from group ${group.name}`);
    return true;
  }

  public bulkGenerateGroups(params: {
    programName: string;
    batchYear: number;
    totalStudents: number;
    numGroups: number;
    namingPattern: string;
    numSubgroupsPerGroup: number;
    departmentId?: string;
  }, userId = 'coordinator'): StudentSection[] {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const studentsPerGroup = Math.max(1, Math.round(params.totalStudents / params.numGroups));
    const studentsPerSubgroup = Math.max(1, Math.round(studentsPerGroup / params.numSubgroupsPerGroup));

    const generated: StudentSection[] = [];

    for (let i = 0; i < params.numGroups; i++) {
      const char = letters[i % letters.length];
      const groupName = params.namingPattern.replace('{A}', char).replace('{N}', String(i + 1));
      this.assertNew(this.groups.values(), (item) => item.name, groupName, 'Group');
      const groupId = this.freeId('sec', groupName, this.groups);

      const subgroups: SubSection[] = [];
      for (let j = 1; j <= params.numSubgroupsPerGroup; j++) {
        subgroups.push({
          id: `sub-${groupId}-${char}${j}`,
          sectionId: groupId,
          name: `${char}${j}`,
          studentCount: studentsPerSubgroup,
          type: 'Lab',
        });
      }

      const newSec: StudentSection = {
        id: groupId,
        name: groupName,
        departmentId: params.departmentId || 'dept-cse',
        program: params.programName,
        semester: 5,
        batchYear: params.batchYear,
        studentCount: studentsPerGroup,
        targetSize: studentsPerGroup,
        maxSize: Math.ceil(studentsPerGroup * 1.2),
        subSections: subgroups,
        classRepresentative: { name: '', email: '', studentId: '' },
        status: 'Active',
      };

      this.groups.set(groupId, newSec);
      generated.push(newSec);
    }

    this.logAudit(
      userId,
      'BULK_GROUPS_GENERATED',
      'StudentSection',
      'multiple',
      `Generated ${generated.length} cohorts with ${params.numSubgroupsPerGroup} subgroups each for batch ${params.batchYear}.`
    );

    return generated;
  }

  // Allocations
  public createAllocation(alloc: Omit<CourseAllocation, 'id'>, userId = 'coordinator'): CourseAllocation {
    const baseId = `alloc-${alloc.courseId}-${alloc.sectionId}${alloc.subSectionId ? `-${alloc.subSectionId}` : ''}-${alloc.sessionType.toLowerCase()}`;
    let id = baseId;
    for (let n = 2; this.allocations.has(id); n++) id = `${baseId}-${n}`;
    const same = [...this.allocations.values()].some((item) => item.courseId === alloc.courseId && item.sectionId === alloc.sectionId
      && (item.subSectionId ?? '') === (alloc.subSectionId ?? '') && item.sessionType === alloc.sessionType && item.facultyId === alloc.facultyId);
    if (same) throw new Error('This teacher already has this course for this group and type of class. Edit that allocation instead.');
    const newAlloc: CourseAllocation = { ...alloc, id, status: 'Allocated' };
    this.allocations.set(id, newAlloc);

    this.logAudit(userId, 'CREATE_ALLOCATION', 'CourseAllocation', id, `Allocated course ${alloc.courseId} to section ${alloc.sectionId}`);
    return newAlloc;
  }

  public updateAllocation(id: string, updates: Partial<CourseAllocation>, userId = 'coordinator'): CourseAllocation {
    const existing = this.allocations.get(id);
    if (!existing) throw new Error(`Allocation ${id} not found.`);
    const updated = { ...existing, ...updates, id };
    this.allocations.set(id, updated);

    this.logAudit(userId, 'UPDATE_ALLOCATION', 'CourseAllocation', id, `Updated allocation ${id}`);
    return updated;
  }

  public deleteAllocation(id: string, userId = 'coordinator'): boolean {
    const res = this.allocations.delete(id);
    this.logAudit(userId, 'DELETE_ALLOCATION', 'CourseAllocation', id, `Deleted allocation ${id}`);
    return res;
  }

  // --------------------------------------------------------------------------
  // TRANSACTIONAL MASTER EXCEL INGESTION
  // --------------------------------------------------------------------------

  /**
   * Checks the periods, fixed-time classes and students of an import against the data the import will leave
   * behind. Returns the new periods, or undefined when the workbook does not change them.
   */
  private validateImportedSchedule(parsedData: ExcelImportPreview['parsedData'], mode: 'upsert' | 'replace'): TimeSlot[] | undefined {
    const problems: string[] = [];
    if (mode !== 'upsert' && mode !== 'replace') throw new ImportValidationError('Choose Merge or Clean Replace.');
    const slotRows = [...(parsedData.timeSlots ?? [])].sort((a, b) => a.periodNumber - b.periodNumber);
    const isTime = (value: unknown) => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
    slotRows.forEach((slot, i) => {
      if (!Number.isInteger(slot.periodNumber) || slot.periodNumber < 1 || !isTime(slot.startTime) || !isTime(slot.endTime) || slot.startTime >= slot.endTime) {
        problems.push(`TimeSlots: period ${slot.periodNumber} needs a number, a start and a later end.`);
      } else if (i > 0 && (slot.periodNumber === slotRows[i - 1].periodNumber || slot.startTime < slotRows[i - 1].endTime)) {
        problems.push(`TimeSlots: period ${slot.periodNumber} repeats or overlaps another period.`);
      }
    });
    if (slotRows.filter((slot) => slot.isLunch).length > 1) problems.push('TimeSlots: only one period can be lunch.');
    if (slotRows.length > 0 && slotRows.every((slot) => slot.isBreak || slot.isLunch)) problems.push('TimeSlots: at least one teaching period is required.');
    const timeSlots: TimeSlot[] | undefined = slotRows.length === 0 ? undefined : slotRows.map((slot) => ({
      id: `ts-${slot.periodNumber}`,
      periodNumber: slot.periodNumber,
      startTime: slot.startTime,
      endTime: slot.endTime,
      label: `${slot.startTime} - ${slot.endTime}${slot.isLunch ? ' (Lunch)' : ''}`,
      ...(slot.isBreak || slot.isLunch ? { isBreak: true } : {}),
      ...(slot.isLunch ? { isLunch: true } : {}),
    }));

    if (timeSlots && mode === 'upsert') {
      const teachingIds = new Set(timeSlots.filter((slot) => !slot.isBreak && !slot.isLunch).map((slot) => slot.id));
      const stranded = this.liveSessions().filter((session) => session.status !== 'Cancelled' && !teachingIds.has(session.timeSlotId)).length;
      if (stranded > 0) problems.push(`TimeSlots: ${stranded} published class periods would be left without a teaching period. Choose Clean Replace, or keep those periods.`);
    }
    const kept = mode === 'replace' ? [] : [...this.groups.values()];
    const courseCodes = new Set([...(mode === 'replace' ? [] : [...this.courses.values()].map((c) => c.code)), ...parsedData.courses.map((c) => c.code)].map((c) => c.toUpperCase()));
    const facultyEmails = new Set([...(mode === 'replace' ? [] : [...this.facultyMembers.values()].map((f) => f.email)), ...parsedData.faculty.map((f) => f.email)].map((e) => e.toLowerCase()));
    const roomNames = new Set([...(mode === 'replace' ? [] : [...this.rooms.values()].map((r) => r.name)), ...parsedData.rooms.map((r) => r.name)].map((r) => r.toUpperCase()));
    const groupCodes = new Set([...kept.map((g) => g.name), ...parsedData.groups.map((g) => g.name)].map((g) => g.toUpperCase()));
    const importedGroups = new Set(parsedData.groups.map((g) => g.name.toUpperCase()));
    const declared = new Set(parsedData.subgroups.map((sub) => String(sub.groupCode).toUpperCase()));
    const keptNames = new Set(kept.filter((g) => (g.subSections || []).length > 0).map((g) => g.name.toUpperCase()));
    const subgroupCodes = new Set([
      ...kept.flatMap((g) => (g.subSections || []).map((sub) => `${g.name}:${sub.name}`)),
      ...parsedData.subgroups.map((sub) => `${sub.groupCode}:${sub.name}`),
      // A new group without subgroups gets two.
      ...[...importedGroups].filter((name) => !declared.has(name) && !keptNames.has(name)).flatMap((name) => [`${name}:1`, `${name}:2`]),
    ].map((code) => code.toUpperCase()));
    parsedData.subgroups.forEach((row, i) => {
      if (!String(row.name ?? '').trim() || !groupCodes.has(String(row.groupCode).toUpperCase())) problems.push(`Subgroups row ${i + 2}: a name and an existing group are required.`);
    });
    const allocationKeys = new Set<string>();
    parsedData.allocations.forEach((row, i) => {
      const where = `CourseAllocations row ${i + 2}`;
      const key = [row.courseCode, row.groupCode, row.subgroupName ?? '', row.sessionType].join('|').toUpperCase();
      if (allocationKeys.has(key)) problems.push(`${where}: repeats ${row.courseCode} ${row.sessionType} for ${row.subgroupName || row.groupCode}.`);
      allocationKeys.add(key);
      const group = String(row.groupCode).toUpperCase();
      if (!courseCodes.has(String(row.courseCode).toUpperCase())) problems.push(`${where}: course ${row.courseCode} was not found.`);
      if (!facultyEmails.has(String(row.facultyEmail).toLowerCase())) problems.push(`${where}: faculty ${row.facultyEmail} was not found.`);
      if (!groupCodes.has(group)) problems.push(`${where}: group ${row.groupCode} was not found.`);
      else if (row.subgroupName && !subgroupCodes.has(`${group}:${row.subgroupName.toUpperCase()}`)) problems.push(`${where}: subgroup ${row.subgroupName} was not found in ${row.groupCode}.`);
    });

    const slots = timeSlots ?? this.academicYear.timeSlots ?? [];
    const teaching = new Map(slots.map((slot) => [slot.periodNumber, !slot.isBreak && !slot.isLunch && slot.id !== (timeSlots ? '' : this.academicYear.lunchPeriodId)]));
    (parsedData.timetable ?? []).forEach((row, i) => {
      const where = `Timetable row ${i + 2}`;
      if (!WEEK_ORDER.includes(row.day)) problems.push(`${where}: unknown day.`);
      else if (this.academicYear.workingDays.length > 0 && !this.academicYear.workingDays.includes(row.day)) problems.push(`${where}: ${row.day} is not a working day.`);
      if (!Number.isInteger(row.periods) || row.periods < 1 || row.periods > slots.length) problems.push(`${where}: invalid number of periods.`);
      else for (let p = row.periodNumber; p < row.periodNumber + row.periods; p++) if (!teaching.get(p)) problems.push(`${where}: period ${p} is not a teaching period.`);
      if (!courseCodes.has(String(row.courseCode).toUpperCase())) problems.push(`${where}: course ${row.courseCode} was not found.`);
      if (!facultyEmails.has(String(row.facultyEmail).toLowerCase())) problems.push(`${where}: faculty ${row.facultyEmail} was not found.`);
      if (!roomNames.has(String(row.roomName).toUpperCase())) problems.push(`${where}: room ${row.roomName} was not found.`);
      const group = String(row.groupCode).toUpperCase();
      if (!groupCodes.has(group)) problems.push(`${where}: group ${row.groupCode} was not found.`);
      else if (row.subgroupName && !subgroupCodes.has(`${group}:${row.subgroupName.toUpperCase()}`)) problems.push(`${where}: subgroup ${row.subgroupName} was not found in ${row.groupCode}.`);
    });
    (parsedData.students ?? []).forEach((student, i) => {
      if (!student.studentId || !student.email || !groupCodes.has(String(student.groupCode).toUpperCase())) {
        problems.push(`Students row ${i + 2}: roll number, email and an existing group are required.`);
      }
    });
    if (problems.length > 0) {
      throw new ImportValidationError(`${problems.slice(0, 10).join('\n')}${problems.length > 10 ? `\n...and ${problems.length - 10} more.` : ''}`);
    }
    return timeSlots;
  }

  public commitMasterExcelImport(
    parsedData: ExcelImportPreview['parsedData'],
    mode: 'upsert' | 'replace' = 'upsert',
    userId = 'coordinator'
  ): { success: boolean; importedCount: number; message: string } {
    const sheets = ['departments', 'programs', 'courses', 'faculty', 'rooms', 'groups', 'subgroups', 'allocations', 'students', 'timeSlots', 'timetable'] as const;
    for (const sheet of sheets) {
      const rows: unknown = parsedData?.[sheet] ?? [];
      if (!Array.isArray(rows) || rows.some((row) => !row || typeof row !== 'object')) throw new ImportValidationError(`The ${sheet} data is not a list of rows.`);
    }
    if (!sheets.some((sheet) => (parsedData[sheet] ?? []).length > 0)) throw new ImportValidationError('The workbook has no rows to import.');
    parsedData = { ...Object.fromEntries(sheets.map((sheet) => [sheet, []])), ...parsedData } as ExcelImportPreview['parsedData'];
    const timeSlots = this.validateImportedSchedule(parsedData, mode);
    let totalImported = 0;

    // In 'replace' mode, clear dependent child collections
    if (mode === 'replace') {
      this.allocations.clear();
      this.groups.clear();
      this.courses.clear();
      this.facultyMembers.clear();
      this.rooms.clear();
    }

    // 1. Departments
    const deptCodeMap = new Map<string, string>();
    this.departments.forEach(d => deptCodeMap.set(d.code.toUpperCase(), d.id));

    if (parsedData.departments.length > 0) {
      parsedData.departments.forEach(deptIn => {
        const codeUpper = deptIn.code.toUpperCase();
        let existingId: string | undefined = undefined;
        for (const [id, d] of this.departments.entries()) {
          if (d.code.toUpperCase() === codeUpper) {
            existingId = id;
            break;
          }
        }
        const id = existingId || `dept-${deptIn.code.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
        this.departments.set(id, { ...deptIn, id });
        deptCodeMap.set(codeUpper, id);
        totalImported++;
      });
    }

    // 2. Programs
    const progCodeMap = new Map<string, string>();
    this.programs.forEach(p => progCodeMap.set(p.code.toUpperCase(), p.id));

    if (parsedData.programs.length > 0) {
      parsedData.programs.forEach(progIn => {
        const codeUpper = progIn.code.toUpperCase();
        const deptId = deptCodeMap.get(progIn.departmentCode?.toUpperCase()) || 'dept-cse';
        let existingId: string | undefined = undefined;
        for (const [id, p] of this.programs.entries()) {
          if (p.code.toUpperCase() === codeUpper) {
            existingId = id;
            break;
          }
        }
        const id = existingId || `prog-${progIn.code.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
        this.programs.set(id, {
          id,
          name: progIn.name,
          code: progIn.code,
          departmentId: deptId,
          durationYears: progIn.durationYears || 4,
          totalSemesters: progIn.totalSemesters || 8,
          status: 'Active',
        });
        progCodeMap.set(codeUpper, id);
        totalImported++;
      });
    }

    // 3. Faculty
    const facEmailMap = new Map<string, string>();
    this.facultyMembers.forEach(f => facEmailMap.set(f.email.toLowerCase(), f.id));

    if (parsedData.faculty.length > 0) {
      parsedData.faculty.forEach(facIn => {
        const emailLower = facIn.email.toLowerCase();
        const deptId = deptCodeMap.get(facIn.departmentCode?.toUpperCase()) || 'dept-cse';
        let existingId: string | undefined = undefined;
        for (const [id, f] of this.facultyMembers.entries()) {
          if (f.email.toLowerCase() === emailLower) {
            existingId = id;
            break;
          }
        }
        const id = existingId || this.freeId('fac', emailLower.split('@')[0], this.facultyMembers);
        const existing = this.facultyMembers.get(id);
        this.facultyMembers.set(id, {
          id,
          name: facIn.name,
          email: facIn.email,
          departmentId: deptId,
          designation: facIn.designation,
          subjectsQualified: facIn.subjectsQualified || [],
          maxDirectTeachingHours: facIn.designation === 'Visiting Faculty' ? (facIn.maxDirectTeachingHours || 14) : facIn.designation === 'Assistant Professor' ? 16 : 14,
          weeklyHoursLimit: 40,
          // Merging keeps the periods a teacher has reserved.
          preferences: facIn.preferences || existing?.preferences || {
            preferredDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
            preferredPeriods: [1, 2, 3, 4, 6, 7],
            protectedSlots: [],
            maxConsecutivePeriods: 3,
            availableForMakeup: true,
            availableForTutorial: true,
          },
          status: 'Active',
        });
        facEmailMap.set(emailLower, id);
        totalImported++;
      });
    }

    // 4. Rooms
    const roomNameMap = new Map<string, string>();
    this.rooms.forEach(r => roomNameMap.set(r.name.toUpperCase(), r.id));

    if (parsedData.rooms.length > 0) {
      parsedData.rooms.forEach(rmIn => {
        const nameUpper = rmIn.name.toUpperCase();
        let existingId: string | undefined = undefined;
        for (const [id, r] of this.rooms.entries()) {
          if (r.name.toUpperCase() === nameUpper) {
            existingId = id;
            break;
          }
        }
        const id = existingId || this.freeId('room', rmIn.name, this.rooms);
        this.rooms.set(id, { ...rmIn, id });
        roomNameMap.set(nameUpper, id);
        totalImported++;
      });
    }

    // 5. Courses
    const courseCodeMap = new Map<string, string>();
    this.courses.forEach(c => courseCodeMap.set(c.code.toUpperCase(), c.id));

    if (parsedData.courses.length > 0) {
      parsedData.courses.forEach(crsIn => {
        const codeUpper = crsIn.code.toUpperCase();
        const deptId = deptCodeMap.get(crsIn.departmentCode?.toUpperCase()) || 'dept-cse';
        const facId = (crsIn.primaryFacultyEmail && facEmailMap.get(crsIn.primaryFacultyEmail.toLowerCase())) || '';
        let existingId: string | undefined = undefined;
        for (const [id, c] of this.courses.entries()) {
          if (c.code.toUpperCase() === codeUpper) {
            existingId = id;
            break;
          }
        }
        const id = existingId || this.freeId('course', crsIn.code, this.courses);
        const existing = this.courses.get(id);
        this.courses.set(id, {
          id,
          code: crsIn.code,
          name: crsIn.name,
          departmentId: deptId,
          credits: crsIn.credits || 4,
          requiredLecturesPerWeek: crsIn.requiredLecturesPerWeek || 3,
          requiredTutorialsPerWeek: crsIn.requiredTutorialsPerWeek || 0,
          requiredLabsPerWeek: crsIn.requiredLabsPerWeek || 0,
          totalSemesterHours: crsIn.totalSemesterHours || 45,
          completedHours: existing?.completedHours ?? 0,
          cancelledHours: existing?.cancelledHours ?? 0,
          requiresLab: crsIn.requiresLab || (crsIn.requiredLabsPerWeek || 0) > 0,
          requiredEquipment: crsIn.requiredEquipment || ['Projector'],
          primaryFacultyId: facId,
          status: 'Active',
        });
        courseCodeMap.set(codeUpper, id);
        totalImported++;
      });
    }

    // 6. Groups & Subgroups
    const groupCodeMap = new Map<string, string>();
    const subgroupCodeMap = new Map<string, string>();
    this.groups.forEach(s => {
      groupCodeMap.set(s.name.toUpperCase(), s.id);
      (s.subSections || []).forEach(sub => {
        subgroupCodeMap.set(`${s.name.toUpperCase()}:${sub.name.toUpperCase()}`, sub.id);
      });
    });

    if (parsedData.groups.length > 0) {
      parsedData.groups.forEach(grpIn => {
        const codeUpper = grpIn.name.toUpperCase();
        const progId = progCodeMap.get(grpIn.program?.toUpperCase()) || '';
        let existingId: string | undefined = undefined;
        for (const [id, g] of this.groups.entries()) {
          if (g.name.toUpperCase() === codeUpper) {
            existingId = id;
            break;
          }
        }
        const secId = existingId || this.freeId('sec', grpIn.name, this.groups);
        const existing = this.groups.get(secId);
        groupCodeMap.set(codeUpper, secId);

        // Merging adds and updates subgroups; the ones not mentioned stay, because classes and students refer to them.
        const builtSubgroups: SubSection[] = [...(existing?.subSections ?? [])];
        const isDeclared = parsedData.subgroups.some((sub) => sub.groupCode.toUpperCase() === codeUpper);
        if (builtSubgroups.length === 0 && !isDeclared) {
          builtSubgroups.push(
            { id: `sub-${secId}-1`, sectionId: secId, name: '1', studentCount: Math.ceil(grpIn.studentCount / 2), type: 'Lab' },
            { id: `sub-${secId}-2`, sectionId: secId, name: '2', studentCount: Math.floor(grpIn.studentCount / 2), type: 'Lab' }
          );
        }

        this.groups.set(secId, {
          id: secId,
          name: grpIn.name,
          departmentId: grpIn.departmentId || this.programs.get(progId)?.departmentId || 'dept-cse',
          program: grpIn.program,
          programId: progId,
          semester: grpIn.semester || 5,
          batchYear: grpIn.batchYear || 2024,
          studentCount: grpIn.studentCount,
          targetSize: grpIn.targetSize || grpIn.studentCount,
          maxSize: grpIn.maxSize || Math.ceil(grpIn.studentCount * 1.2),
          subSections: builtSubgroups,
          classRepresentative: grpIn.classRepresentative ?? existing?.classRepresentative ?? { name: '', email: '', studentId: '' },
          status: 'Active',
        });
        totalImported++;
      });
    }

    parsedData.subgroups.forEach((subIn) => {
      const groupId = groupCodeMap.get(subIn.groupCode.toUpperCase())!;
      const group = this.groups.get(groupId)!;
      const subSections = [...(group.subSections ?? [])];
      const at = subSections.findIndex((sub) => sub.name.toUpperCase() === subIn.name.toUpperCase());
      const saved: SubSection = {
        id: at >= 0 ? subSections[at].id : this.freeId(`sub-${groupId}`, subIn.name, new Map(subSections.map((sub) => [sub.id, sub]))),
        sectionId: groupId,
        name: subIn.name,
        studentCount: subIn.studentCount || Math.ceil(group.studentCount / 2),
        type: subIn.type || 'Lab',
      };
      if (at >= 0) subSections[at] = saved;
      else subSections.push(saved);
      this.groups.set(groupId, { ...group, subSections });
    });
    this.groups.forEach((group) => (group.subSections ?? []).forEach((sub) => {
      subgroupCodeMap.set(`${group.name.toUpperCase()}:${sub.name.toUpperCase()}`, sub.id);
    }));

    // 7. Course Allocations
    if (parsedData.allocations.length > 0) {
      parsedData.allocations.forEach(allocIn => {
        const courseId = courseCodeMap.get(allocIn.courseCode.toUpperCase())!;
        const facultyId = facEmailMap.get(allocIn.facultyEmail.toLowerCase())!;
        const sectionId = groupCodeMap.get(allocIn.groupCode.toUpperCase())!;
        const subSectionId = allocIn.subgroupName
          ? subgroupCodeMap.get(`${allocIn.groupCode.toUpperCase()}:${allocIn.subgroupName.toUpperCase()}`)
          : undefined;
        const roomId = allocIn.roomName ? roomNameMap.get(allocIn.roomName.toUpperCase()) : undefined;

        const allocId = `alloc-${courseId}-${sectionId}${subSectionId ? `-${subSectionId}` : ''}-${allocIn.sessionType.toLowerCase()}`;
        this.allocations.set(allocId, {
          id: allocId,
          courseId,
          facultyId,
          sectionId,
          subSectionId,
          sessionType: allocIn.sessionType,
          hoursPerWeek: allocIn.hoursPerWeek,
          preferredRoomId: roomId,
          status: 'Allocated',
        });
        totalImported++;
      });
    }

    // A teacher is qualified for every course they are given, so substitutes can be suggested.
    for (const allocation of this.allocations.values()) {
      const faculty = this.facultyMembers.get(allocation.facultyId);
      const code = this.courses.get(allocation.courseId)?.code;
      if (faculty && code && !faculty.subjectsQualified.includes(code)) {
        this.facultyMembers.set(faculty.id, { ...faculty, subjectsQualified: [...faculty.subjectsQualified, code] });
      }
    }

    // 8. Students
    const importedStudents = parsedData.students ?? [];
    if (importedStudents.length > 0) {
      if (mode === 'replace') this.students.clear();
      const idByRoll = new Map([...this.students.values()].map((student) => [student.studentId.toLowerCase(), student.id]));
      importedStudents.forEach((row) => {
        const group = row.groupCode.toUpperCase();
        const section = this.groups.get(groupCodeMap.get(group)!)!;
        const subSection = row.subgroupName ? section.subSections?.find((sub) => sub.name.toUpperCase() === row.subgroupName!.toUpperCase()) : undefined;
        const roll = row.studentId.toLowerCase();
        const id = idByRoll.get(roll) ?? `stu-${roll.replace(/[^a-z0-9]/g, '')}`;
        idByRoll.set(roll, id);
        this.students.set(id, {
          id,
          studentId: row.studentId,
          name: row.name,
          email: row.email.toLowerCase(),
          programCode: row.programCode || section.program,
          batchYear: row.batchYear || section.batchYear,
          semester: section.semester,
          sectionId: section.id,
          sectionName: section.name,
          subSectionId: subSection?.id ?? '',
          subSectionName: subSection?.name ?? '',
        });
        totalImported++;
      });
    }

    // A clean replace removes the classes, requests and polls of records that no longer exist.
    if (mode === 'replace') {
      for (const student of this.students.values()) {
        if (!this.groups.has(student.sectionId)) this.students.delete(student.id);
      }
      this.academicYear = { ...this.academicYear, publishStatus: 'Draft' };
      this.makeupTasks = [];
      this.recoveryOpportunities = [];
      this.replacementPolls = [];
      this.replacementVotes.clear();
      this.notifications = [];
    }

    // 9. Daily periods
    const importedClasses = parsedData.timetable ?? [];
    if (timeSlots) {
      this.academicYear = { ...this.academicYear, timeSlots, lunchPeriodId: timeSlots.find((slot) => slot.isLunch)?.id ?? '' };
      totalImported += timeSlots.length;
    }
    if (mode === 'replace') {
      this.activeSessions = this.activeSessions.filter((session) => this.fitsCurrentData(session));
      this.versions = this.versions
        .filter((version) => version.sessions.every((session) => this.fitsCurrentData(session)))
        .map((version) => ({ ...version, isPublished: false, status: version.status === 'Published' ? 'Approved' : version.status }));
    }

    // 10. Classes with fixed times become the working draft. Publishing still goes through validation.
    let timetableNote = '';
    if (importedClasses.length > 0) {
      if (this.academicYear.workingDays.length === 0) {
        this.academicYear = { ...this.academicYear, workingDays: WEEK_ORDER.filter((day) => importedClasses.some((row) => row.day === day)) };
      }
      const versionNumber = this.nextVersionNumber();
      const slotIdByPeriod = new Map(this.academicYear.timeSlots.map((slot) => [slot.periodNumber, slot.id]));
      // One session per period, as the generator stores labs.
      const sessions: ClassSession[] = importedClasses.flatMap((row, i) => {
        const courseId = courseCodeMap.get(row.courseCode.toUpperCase())!;
        const sectionId = groupCodeMap.get(row.groupCode.toUpperCase())!;
        const subSectionId = row.subgroupName
          ? this.groups.get(sectionId)?.subSections?.find((sub) => sub.name.toUpperCase() === row.subgroupName!.toUpperCase())?.id
          : undefined;
        const allocationId = `alloc-${courseId}-${sectionId}${subSectionId ? `-${subSectionId}` : ''}-${row.sessionType.toLowerCase()}`;
        return Array.from({ length: row.periods }, (_, k): ClassSession => ({
          id: `sess-v${versionNumber}-${i + 1}-${k + 1}`,
          ...(this.allocations.has(allocationId) ? { allocationId } : {}),
          courseId,
          facultyId: facEmailMap.get(row.facultyEmail.toLowerCase())!,
          sectionId,
          subSectionId,
          roomId: roomNameMap.get(row.roomName.toUpperCase())!,
          day: row.day,
          timeSlotId: slotIdByPeriod.get(row.periodNumber + k)!,
          durationPeriods: row.periods,
          type: row.sessionType,
          status: 'Planned',
          version: 1,
        }));
      });
      this.activeSessions = sessions;
      this.academicYear = { ...this.academicYear, publishStatus: 'Draft' };
      const report = this.validateCurrentTimetable();
      this.addVersion({
        id: `ver-${versionNumber}`,
        versionNumber,
        versionLabel: `Imported V${versionNumber}.0`,
        createdAt: new Date().toISOString(),
        createdBy: userId,
        changeSummary: `Imported ${importedClasses.length} classes (${sessions.length} periods) with fixed times.`,
        reason: 'Master workbook import',
        isPublished: false,
        status: 'Draft',
        healthScore: calculateHealthScore(sessions, [...this.rooms.values()], [...this.facultyMembers.values()], [...this.groups.values()], [...this.courses.values()], this.academicYear).overallScore,
        sessionsCount: sessions.length,
        hardViolationsCount: report.hardViolationsCount,
        sessions,
      });
      totalImported += importedClasses.length;
      timetableNote = ` ${importedClasses.length} classes loaded as draft V${versionNumber}.0 with ${report.hardViolationsCount} hard conflict(s).`;
    }

    // 11. Immutable Audit Log
    this.logAudit(
      userId,
      'EXCEL_MASTER_IMPORT',
      'AcademicSetup',
      'master-workbook',
      `Transactionally imported ${totalImported} academic records across sheets (Mode: ${mode}).`
    );

    return {
      success: true,
      importedCount: totalImported,
      message: `Master setup data successfully persisted to PostgreSQL database (${totalImported} records processed).${timetableNote}`,
    };
  }

  // --------------------------------------------------------------------------
  // TIMETABLE GENERATOR, SOLVER & VALIDATOR
  // --------------------------------------------------------------------------

  public generateMasterTimetable(options: {
    budgetMode?: 'FAST' | 'BALANCED' | 'MAXIMUM_OPTIMIZATION';
    timeBudgetMs?: number;
    seed?: number;
    maxCandidates?: number;
  }, userId = 'coordinator') {
    return this.generateDualRoutines({
      timeBudgetMs: options.timeBudgetMs || 800,
      budgetMode: options.budgetMode || 'BALANCED',
    }, userId);
  }

  public generateDualRoutines(options: {
    budgetMode?: 'FAST' | 'BALANCED' | 'MAXIMUM_OPTIMIZATION';
    timeBudgetMs?: number;
    routines?: Array<{ id: string; label: string; optimizationProfile: 'STUDENT_FOCUSED' | 'FACULTY_FOCUSED' | 'BALANCED' }>;
    /** Results solved elsewhere (a worker thread), in routine order. */
    results?: EngineResult[];
  } = {}, userId = 'coordinator') {
    const allocations = Array.from(this.allocations.values());
    const facultyMembers = Array.from(this.facultyMembers.values());
    const rooms = Array.from(this.rooms.values());
    const sections = Array.from(this.groups.values());
    const courses = Array.from(this.courses.values());
    const constraints = Array.from(this.constraints.values());

    const totalAllocatedHours = allocations.reduce((sum, a) => sum + a.hoursPerWeek, 0);

    const routineConfigs = options.routines || [
      {
        id: 'student-focused',
        label: 'Student-focused',
        description: 'Prioritizes student timetable quality and minimizes student gaps.',
        optimizationProfile: 'STUDENT_FOCUSED' as const,
        seed: 1337,
      },
      {
        id: 'faculty-focused',
        label: 'Faculty-focused',
        description: 'Prioritizes faculty timetable quality and minimizes faculty gaps.',
        optimizationProfile: 'FACULTY_FOCUSED' as const,
        seed: 9999,
      },
    ];

    const generatedRoutines: any[] = [];
    let failure = '';
    let bestResultSessions: ClassSession[] = [];

    for (let idx = 0; idx < routineConfigs.length; idx++) {
      const cfg = routineConfigs[idx];
      const result = options.results?.[idx] ?? executeOptimizationEngine(
        this.academicYear,
        allocations,
        facultyMembers,
        rooms,
        sections,
        courses,
        constraints,
        {
          budgetMode: options.budgetMode || 'BALANCED',
          optimizationProfile: cfg.optimizationProfile,
          timeBudgetMs: options.timeBudgetMs || 800,
          seed: (cfg as any).seed || (1337 + idx * 8642),
          maxCandidates: 1,
          fixedSessions: this.lockedSessions(),
        }
      );

      let candidateSessions = this.keepLocks(result.bestCandidate?.sessions || []);
      const valReport = validateTimetableIndependently(candidateSessions, {
        academicYear: this.academicYear,
        allocations,
        facultyMembers,
        rooms,
        sections,
        courses,
        constraints,
      });

      const lost = this.lockedSessions().filter((locked) => !candidateSessions.some((session) => session.isLocked && this.placeKey(session) === this.placeKey(locked)));
      if (lost.length > 0) {
        failure = `The locked class ${this.describeClass(lost[0])} no longer matches a course allocation. Unlock it, or restore its allocation.`;
        continue;
      }
      // A failed or incomplete run must not replace the current draft or enter the version history.
      if (!result.bestCandidate || valReport.hardViolationsCount > 0 || candidateSessions.length !== totalAllocatedHours) {
        failure = result.infeasibilityDiagnostics?.[0]
          || valReport.violations.find((violation) => violation.severity === 'CRITICAL')?.message
          || result.statusMessage;
        continue;
      }

      const verNum = this.nextVersionNumber();
      candidateSessions = this.numbered(candidateSessions, verNum);
      const ver: TimetableVersion = {
        id: `ver-${verNum}`,
        versionNumber: verNum,
        versionLabel: `${cfg.label} Draft V${verNum}.0`,
        label: `${cfg.label} Draft V${verNum}.0`,
        createdAt: new Date().toISOString(),
        createdBy: userId,
        changeSummary: `Generated ${cfg.label} timetable (${candidateSessions.length} sessions).`,
        reason: 'Automated Multi-Routine Solver Run',
        isPublished: false,
        healthScore: this.currentHealth(candidateSessions),
        sessionsCount: candidateSessions.length,
        hardViolationsCount: valReport.hardViolationsCount,
        sessions: candidateSessions,
      };

      this.addVersion(ver);

      if (generatedRoutines.length === 0) {
        bestResultSessions = candidateSessions;
        this.activeSessions = candidateSessions;
        this.academicYear.publishStatus = 'Draft';
      }

      generatedRoutines.push({
        id: cfg.id,
        label: cfg.label,
        description: (cfg as any).description || `Independently validated ${cfg.label} schedule.`,
        optimizationProfile: cfg.optimizationProfile,
        versionId: ver.id,
        versionNumber: verNum,
        sessions: candidateSessions,
        validation: {
          valid: valReport.hardViolationsCount === 0 && candidateSessions.length === totalAllocatedHours,
          hardViolations: valReport.hardViolationsCount,
          unscheduled: Math.max(0, totalAllocatedHours - candidateSessions.length),
          studentConflicts: valReport.violations.filter(v => v.code === 'GROUP_COLLISION' || v.code === 'SUBGROUP_COLLISION' || v.code === 'CROSS_COHORT_COLLISION').length,
          facultyConflicts: valReport.violations.filter(v => v.code === 'FACULTY_COLLISION').length,
          roomConflicts: valReport.violations.filter(v => v.code === 'ROOM_COLLISION').length,
          capacityViolations: valReport.violations.filter(v => v.code === 'CAPACITY_SHORTAGE').length,
          availabilityViolations: valReport.violations.filter(v => v.code === 'FACULTY_UNAVAILABLE' || v.code === 'ROOM_UNAVAILABLE' || v.code === 'BREAK_PERIOD_VIOLATION' || v.code === 'NON_WORKING_DAY').length,
          blockingReasons: valReport.violations.filter(v => v.severity === 'CRITICAL').map(v => v.message),
        },
        metrics: {
          studentGaps: valReport.metrics.totalStudentGaps,
          facultyGaps: valReport.metrics.totalFacultyGaps,
          roomUtilization: valReport.metrics.roomUtilizationRate,
          labUtilization: valReport.metrics.labUtilizationRate,
          sameCourseSameDayCount: valReport.metrics.sameCourseSameDayCount,
          sameCourseConsecutiveCount: valReport.metrics.sameCourseConsecutiveCount,
          avgStudentDailyLoad: valReport.metrics.avgStudentDailyLoad,
          maxStudentDailyLoad: valReport.metrics.maxStudentDailyLoad,
          avgFacultyDailyLoad: valReport.metrics.avgFacultyDailyLoad,
          maxFacultyDailyLoad: valReport.metrics.maxFacultyDailyLoad,
          courseDistributionQualityRate: valReport.metrics.courseDistributionQualityRate,
        },
        healthScore: this.currentHealth(candidateSessions),
      });
    }

    if (generatedRoutines.length === 0) {
      return {
        success: false,
        isFeasible: false,
        routines: [],
        sessionsGenerated: 0,
        message: `No valid timetable was found, so the current draft was kept. ${failure}`.trim(),
        timestamp: new Date().toISOString(),
      };
    }

    this.logAudit(
      userId,
      'DUAL_ROUTINES_GENERATED',
      'TimetableVersion',
      'multi-routine-run',
      `Generated and independently validated ${generatedRoutines.length} distinct optimization routines.`
    );

    return {
      success: true,
      isFeasible: generatedRoutines.every(r => r.validation.valid),
      routines: generatedRoutines,
      sessionsGenerated: bestResultSessions.length,
      timestamp: new Date().toISOString(),
    };
  }

  public updateAcademicYear(updates: Partial<Pick<AcademicYearConfig, 'yearLabel' | 'semesterType' | 'semesterNumber' | 'workingDays'>>, userId = 'coordinator') {
    this.academicYear = { ...this.academicYear, ...updates };
    this.logAudit(userId, 'ACADEMIC_YEAR_CONFIG_UPDATED', 'AcademicYearConfig', this.academicYear.id, 'Updated semester calendar and working days.');
    return this.academicYear;
  }

  public setConstraintActive(id: string, isActive: boolean, userId = 'coordinator'): AcademicConstraint | null {
    const constraint = this.constraints.get(id);
    if (!constraint) return null;
    const updated = { ...constraint, isActive };
    this.constraints.set(id, updated);
    this.logAudit(userId, 'CONSTRAINT_UPDATED', 'AcademicConstraint', id, `${isActive ? 'Enabled' : 'Disabled'} ${constraint.name}.`);
    return updated;
  }

  /** A class asks for a make-up. Returns false when the same request is already waiting. */
  public requestStudentMakeup(courseId: string, sectionId: string, userName = 'Class representative'): boolean {
    const waiting = this.notifications.some((item) => item.type === 'makeup_request' && !item.read && item.actionPayload?.courseId === courseId && item.actionPayload?.sectionId === sectionId);
    if (waiting) return false;
    this.notifications = [{
      id: `notif-${crypto.randomUUID()}`,
      type: 'makeup_request',
      recipientRole: 'Coordinator',
      title: `Make-up requested: ${this.courses.get(courseId)?.code ?? courseId}`,
      message: `${this.groups.get(sectionId)?.name ?? sectionId} asked for a make-up class.`,
      timestamp: new Date().toISOString(),
      read: false,
      category: 'Info',
      actionable: true,
      actionPayload: { courseId, sectionId },
    }, ...this.notifications];
    this.logAudit(userName, 'MAKEUP_REQUESTED', 'StudentSection', sectionId, `Requested a make-up for ${courseId}.`);
    return true;
  }

  private currentHealth(sessions: ClassSession[] = this.activeSessions): number {
    return calculateHealthScore(sessions, [...this.rooms.values()], [...this.facultyMembers.values()], [...this.groups.values()], [...this.courses.values()], this.academicYear).overallScore;
  }

  private nextVersionNumber(): number {
    return Math.max(0, ...this.versions.map((version) => version.versionNumber)) + 1;
  }

  /** Every version holds a full copy of the timetable, and every save writes them all. */
  private addVersion(version: TimetableVersion) {
    const kept = [version, ...this.versions];
    this.versions = kept.filter((item, i) => i < MAX_VERSIONS || item.isPublished || item.status === 'Published');
  }

  public lockedSessions(): ClassSession[] {
    return this.activeSessions.filter((session) => session.isLocked && session.status !== 'Cancelled');
  }

  public isSessionLocked(sessionId: string): boolean {
    return Boolean(this.activeSessions.find((session) => session.id === sessionId)?.isLocked);
  }

  private placeKey(s: ClassSession): string {
    return [s.courseId, s.sectionId, s.subSectionId ?? '', s.facultyId, s.roomId, s.day, s.timeSlotId].join('|');
  }

  /** Carry lock marks over to a newly generated timetable, which keeps locked classes in place. */
  private keepLocks(sessions: ClassSession[]): ClassSession[] {
    const locked = new Map(this.lockedSessions().map((session) => [this.placeKey(session), session]));
    return sessions.map((session) => {
      const lock = locked.get(this.placeKey(session));
      return lock ? { ...session, isLocked: true, lockReason: lock.lockReason } : session;
    });
  }

  private courseCode(courseId: string): string {
    return this.courses.get(courseId)?.code ?? courseId;
  }

  private when(day: string, timeSlotId: string, periods = 1): string {
    return `${day} ${periodLabel(this.academicYear, timeSlotId, periods)}`;
  }

  /** "UCS615 for 3C7 · 3C72, Tuesday 09:40 - 11:20", for messages people read. */
  private describeClass(session: Pick<ClassSession, 'courseId' | 'sectionId' | 'subSectionId' | 'day' | 'timeSlotId'>, periods = 1): string {
    const group = this.groups.get(session.sectionId);
    const subgroup = group?.subSections?.find((sub) => sub.id === session.subSectionId);
    const audience = [group?.name ?? session.sectionId, subgroup?.name].filter(Boolean).join(' · ');
    return `${this.courseCode(session.courseId)} for ${audience}, ${this.when(session.day, session.timeSlotId, periods)}`;
  }

  /** The classes people follow: the published timetable, and nothing until one has been published. */
  public liveSessions(): ClassSession[] {
    const published = this.versions.find((version) => version.isPublished || version.status === 'Published');
    if (!published) return [];
    return this.academicYear.publishStatus === 'Published' && this.activeSessions.length > 0 ? this.activeSessions : published.sessions;
  }

  /** Change the live classes, and the same classes in a separate draft as long as the draft has not moved them. */
  private updateLiveSessions(update: (sessions: ClassSession[]) => ClassSession[]) {
    const live = this.liveSessions();
    if (live === this.activeSessions) {
      this.activeSessions = update(this.activeSessions);
    } else {
      const placeOf = new Map(live.map((session) => [session.id, `${session.day}|${session.timeSlotId}`]));
      const unmoved = (session: ClassSession) => placeOf.get(session.id) === `${session.day}|${session.timeSlotId}`;
      this.activeSessions = [...update(this.activeSessions.filter(unmoved)), ...this.activeSessions.filter((session) => !unmoved(session))];
    }
    this.versions = this.versions.map((version) => version.isPublished || version.status === 'Published'
      ? { ...version, sessions: update(version.sessions) }
      : version);
  }

  /** Session ids are unique across versions, so a class in a new draft is never mistaken for a published one. */
  private numbered(sessions: ClassSession[], versionNumber: number): ClassSession[] {
    return sessions.map((session, i) => ({ ...session, id: `sess-v${versionNumber}-${i + 1}` }));
  }

  public selectRoutineVersion(versionNumber: number, userId = 'coordinator'): { success: boolean; version?: TimetableVersion; message?: string } {
    const targetVersion = this.versions.find(v => v.versionNumber === versionNumber);
    if (!targetVersion) {
      return { success: false, message: `Routine version ${versionNumber} not found.` };
    }
    if (!targetVersion.sessions.every((session) => this.fitsCurrentData(session))) {
      return { success: false, message: `${targetVersion.versionLabel} uses groups, courses, teachers, rooms or periods that no longer exist.` };
    }

    const val = validateTimetableIndependently(targetVersion.sessions, {
      academicYear: this.academicYear,
      allocations: Array.from(this.allocations.values()),
      facultyMembers: Array.from(this.facultyMembers.values()),
      rooms: Array.from(this.rooms.values()),
      sections: Array.from(this.groups.values()),
      courses: Array.from(this.courses.values()),
      constraints: Array.from(this.constraints.values()),
    });

    if (val.hardViolationsCount > 0) {
      return { success: false, message: `Cannot select routine with ${val.hardViolationsCount} hard violations.` };
    }

    this.activeSessions = [...targetVersion.sessions];
    this.academicYear.publishStatus = 'Draft';

    this.logAudit(
      userId,
      'ROUTINE_SELECTED',
      'TimetableVersion',
      `v-${versionNumber}`,
      `Selected routine ${targetVersion.versionLabel} as active draft.`
    );

    return {
      success: true,
      version: targetVersion,
      message: `Routine '${targetVersion.versionLabel}' set as active draft.`,
    };
  }

  /** Add an explicitly selected class to the shared timetable after server-side validation. */
  public addClassSession(input: Omit<ClassSession, 'id' | 'version'>, userId = 'coordinator'):
    { success: boolean; session?: ClassSession; error?: string } {
    const check = checkHardConstraints(input, this.activeSessions,
      Array.from(this.rooms.values()), Array.from(this.facultyMembers.values()),
      Array.from(this.groups.values()), Array.from(this.courses.values()));
    if (!check.isFeasible) return { success: false, error: check.violations.join(' | ') };
    const session: ClassSession = { ...input, id: `sess-${crypto.randomUUID()}`, version: 1 };
    this.activeSessions = [...this.activeSessions, session];
    this.academicYear.publishStatus = 'Draft';
    const versionNumber = this.nextVersionNumber();
    this.addVersion({
      versionNumber,
      versionLabel: `Draft V${versionNumber}.0`,
      createdAt: new Date().toISOString(),
      createdBy: userId,
      changeSummary: `Added ${this.describeClass(input)}.`,
      reason: 'Manual class assignment',
      isPublished: false,
      healthScore: this.currentHealth(),
      sessions: this.activeSessions,
    });
    this.logAudit(userId, 'CLASS_SESSION_ADDED', 'ClassSession', session.id,
      `Added ${this.describeClass(input)} with ${this.facultyMembers.get(input.facultyId)?.name ?? input.facultyId} in ${this.rooms.get(input.roomId)?.name ?? input.roomId}.`);
    return { success: true, session };
  }

  public deleteClassSession(sessionId: string, userId = 'coordinator'): boolean {
    const target = this.activeSessions.find((session) => session.id === sessionId);
    if (!target) return false;
    const block = new Set(classBlock(target, this.activeSessions).map((session) => session.id));
    this.activeSessions = this.activeSessions.filter((session) => !block.has(session.id));
    this.academicYear.publishStatus = 'Draft';
    this.logAudit(userId, 'CLASS_SESSION_DELETED', 'ClassSession', sessionId, `Removed ${this.describeClass(target)}.`);
    return true;
  }

  public setSessionLock(sessionId: string, isLocked: boolean, reason: string, userId = 'coordinator'): ClassSession | null {
    const target = this.activeSessions.find((session) => session.id === sessionId);
    if (!target) return null;
    const block = new Set(classBlock(target, this.activeSessions).map((session) => session.id));
    const apply = (s: ClassSession): ClassSession => ({ ...s, isLocked, lockReason: isLocked ? reason : undefined });
    this.activeSessions = this.activeSessions.map((session) => block.has(session.id) ? apply(session) : session);
    const updated = apply(target);
    this.logAudit(userId, isLocked ? 'SESSION_LOCKED' : 'SESSION_UNLOCKED', 'ClassSession', sessionId, `${isLocked ? 'Locked' : 'Unlocked'} ${this.describeClass(updated)}. ${reason}`);
    return updated;
  }

  public resetDemoDataset() {
    // The sample classes use the sample periods, which an import may have replaced.
    this.academicYear = { ...INITIAL_ACADEMIC_YEAR };
    this.seedInitialDatabase();
  }

  public toggleFacultyProtectedSlot(facultyId: string, day: DayOfWeek, periodId: string, reason: Faculty['preferences']['protectedSlots'][number]['reason']) {
    const faculty = this.facultyMembers.get(facultyId);
    if (!faculty) return null;
    const exists = faculty.preferences.protectedSlots.some((slot) => slot.day === day && slot.periodId === periodId);
    const protectedSlots = exists
      ? faculty.preferences.protectedSlots.filter((slot) => !(slot.day === day && slot.periodId === periodId))
      : [...faculty.preferences.protectedSlots, { day, periodId, reason }];
    const updated = { ...faculty, preferences: { ...faculty.preferences, protectedSlots } };
    this.facultyMembers.set(facultyId, updated);
    return updated;
  }

  private applyPlaces(places: ReadonlyMap<string, Pick<ClassSession, 'day' | 'timeSlotId' | 'roomId'>>) {
    this.activeSessions = this.activeSessions.map((session) => places.has(session.id)
      ? { ...session, ...places.get(session.id), version: (session.version || 1) + 1 }
      : session);
    this.academicYear.publishStatus = 'Draft';
  }

  // Controlled Manual Session Move with Independent Validation
  public moveSessionWithValidation(
    sessionId: string,
    targetDay: DayOfWeek,
    targetTimeSlotId: string,
    targetRoomId: string,
    reason = 'Manual Coordinator Adjustment',
    userId = 'coordinator'
  ): { success: boolean; error?: string; updatedVersion?: TimetableVersion } {
    if (this.isSessionLocked(sessionId)) return { success: false, error: 'This class is locked. Unlock it before moving it.' };
    const allocations = Array.from(this.allocations.values());
    const facultyMembers = Array.from(this.facultyMembers.values());
    const rooms = Array.from(this.rooms.values());
    const sections = Array.from(this.groups.values());
    const courses = Array.from(this.courses.values());

    const valResult = validateProposedSessionMove(
      this.activeSessions,
      sessionId,
      targetDay,
      targetTimeSlotId,
      targetRoomId,
      {
        academicYear: this.academicYear,
        allocations,
        facultyMembers,
        rooms,
        sections,
        courses,
      }
    );

    if (!valResult.allowed) {
      return {
        success: false,
        error: valResult.blockingReason || 'Cannot move session: Constraint violation detected.',
      };
    }

    const targetSession = this.activeSessions.find(s => s.id === sessionId);
    if (!targetSession) return { success: false, error: 'Session not found' };

    const oldDay = targetSession.day;
    const oldSlot = targetSession.timeSlotId;
    const oldRoom = targetSession.roomId;

    this.applyPlaces(valResult.places!);

    const newVerNum = this.nextVersionNumber();
    const courseObj = this.courses.get(targetSession.courseId);
    const roomObj = this.rooms.get(targetRoomId);

    const newVersion: TimetableVersion = {
      versionNumber: newVerNum,
      versionLabel: `Draft V${newVerNum}.0`,
      createdAt: new Date().toISOString(),
      createdBy: userId,
      changeSummary: `${courseObj?.code || targetSession.courseId} moved from ${this.when(oldDay, oldSlot)} to ${this.when(targetDay, targetTimeSlotId)} in ${roomObj?.name || targetRoomId}`,
      reason,
      isPublished: false,
      healthScore: this.currentHealth(),
      sessions: this.activeSessions,
    };
    this.addVersion(newVersion);

    this.logAudit(
      userId,
      'SESSION_MANUALLY_MOVED',
      'ClassSession',
      sessionId,
      `Moved ${this.courseCode(targetSession.courseId)}: ${this.when(oldDay, oldSlot)} (${this.rooms.get(oldRoom)?.name ?? oldRoom}) -> ${this.when(targetDay, targetTimeSlotId)} (${roomObj?.name ?? targetRoomId}). Validated: PASS.`
    );

    return { success: true, updatedVersion: newVersion };
  }

  // Controlled Session Swap
  public swapSessionsWithValidation(
    sessionAId: string,
    sessionBId: string,
    reason = 'Manual Coordinator Swap',
    userId = 'coordinator'
  ): { success: boolean; error?: string; updatedVersion?: TimetableVersion } {
    if (this.isSessionLocked(sessionAId) || this.isSessionLocked(sessionBId)) return { success: false, error: 'A locked class cannot be swapped. Unlock it first.' };
    const allocations = Array.from(this.allocations.values());
    const facultyMembers = Array.from(this.facultyMembers.values());
    const rooms = Array.from(this.rooms.values());
    const sections = Array.from(this.groups.values());
    const courses = Array.from(this.courses.values());

    const valResult = validateProposedSessionSwap(
      this.activeSessions,
      sessionAId,
      sessionBId,
      {
        academicYear: this.academicYear,
        allocations,
        facultyMembers,
        rooms,
        sections,
        courses,
      }
    );

    if (!valResult.allowed) {
      return {
        success: false,
        error: valResult.blockingReason || 'Cannot swap sessions: Constraint conflict detected.',
      };
    }

    const sessA = this.activeSessions.find(s => s.id === sessionAId);
    const sessB = this.activeSessions.find(s => s.id === sessionBId);
    if (!sessA || !sessB) return { success: false, error: 'Sessions not found.' };

    this.applyPlaces(valResult.places!);

    const newVerNum = this.nextVersionNumber();
    const newVersion: TimetableVersion = {
      versionNumber: newVerNum,
      versionLabel: `Draft V${newVerNum}.0`,
      createdAt: new Date().toISOString(),
      createdBy: userId,
      changeSummary: `Swapped ${this.describeClass(sessA)} with ${this.describeClass(sessB)}`,
      reason,
      isPublished: false,
      healthScore: this.currentHealth(),
      sessions: this.activeSessions,
    };
    this.addVersion(newVersion);

    this.logAudit(
      userId,
      'SESSIONS_MANUALLY_SWAPPED',
      'ClassSession',
      `${sessionAId}:${sessionBId}`,
      `Swapped ${this.courseCode(sessA.courseId)} and ${this.courseCode(sessB.courseId)}. Validated: PASS.`
    );

    return { success: true, updatedVersion: newVersion };
  }

  // Approval (Admin / Dean)
  public submitForApproval(userId = 'coordinator') {
    this.academicYear.publishStatus = 'Review';
    this.logAudit(userId, 'TIMETABLE_SUBMITTED', 'TimetableVersion', `draft-${this.academicYear.yearLabel}`, 'Submitted the working draft for approval.');
  }

  public approveTimetable(versionId: string, reviewerName = 'Dean Academic Affairs'): boolean {
    this.academicYear.publishStatus = 'Approved';
    this.academicYear.approvedBy = reviewerName;
    this.academicYear.approvedAt = new Date().toISOString();

    this.logAudit(reviewerName, 'TIMETABLE_APPROVED', 'TimetableVersion', versionId, `Timetable version ${versionId} approved.`);
    return true;
  }

  // Publishing (Admin / Dean)
  /** A class cancelled in the live timetable stays cancelled, with its make-up, when a draft that still has it is published. */
  private carryCancellations(live: ClassSession[]) {
    if (live === this.activeSessions) return;
    const cancelled = new Map(live.filter((session) => session.status === 'Cancelled').map((session) => [session.id, session]));
    const carried = new Set<string>();
    this.activeSessions = this.activeSessions.map((session) => {
      const before = cancelled.get(session.id);
      if (!before || this.placeKey(before) !== this.placeKey(session)) return session;
      carried.add(session.id);
      return { ...session, status: 'Cancelled', statusBeforeCancellation: before.statusBeforeCancellation, cancellationReason: before.cancellationReason, cancellationTimestamp: before.cancellationTimestamp };
    });
    const present = new Set(this.activeSessions.map((session) => session.id));
    const makeups = live.filter((session) => session.type === 'Makeup' && !present.has(session.id) && carried.has(session.originalSessionId ?? ''));
    const blocked = new Set(makeups.filter((makeup) => this.activeSessions.some((other) => other.status !== 'Cancelled' && sessionsClash(makeup, other))).map((makeup) => makeup.originalSessionId));
    this.activeSessions = [...this.activeSessions, ...makeups.filter((makeup) => !blocked.has(makeup.originalSessionId))];
    // A make-up the new timetable has no room for is offered again.
    this.makeupTasks = this.makeupTasks.map((task) => blocked.has(task.cancelledSessionId) ? { ...task, status: 'ProposalsGenerated' } : task);
    this.recoveryOpportunities = this.recoveryOpportunities.map((item) => {
      const task = this.makeupTasks.find((entry) => entry.id === item.makeupTaskId);
      return task && blocked.has(task.cancelledSessionId) && item.status !== 'Approved' ? { ...item, status: 'Proposed' } : item;
    });
  }

  public publishTimetable(requested?: string, publisherName = 'Dean Academic Affairs'): TimetableVersion {
    const live = this.liveSessions();
    this.academicYear.publishStatus = 'Published';
    this.academicYear.publishedAt = new Date().toISOString();

    this.carryCancellations(live);
    const matches = (version: TimetableVersion) => requested && [`V${version.versionNumber}.0`, String(version.versionNumber), version.versionLabel, version.id].includes(requested);
    const samePlaces = (version: TimetableVersion) => {
      const places = new Set(version.sessions.map((session) => `${session.id}|${this.placeKey(session)}`));
      const draft = this.activeSessions.filter((session) => session.type !== 'Makeup');
      return places.size === draft.length && draft.every((session) => places.has(`${session.id}|${this.placeKey(session)}`));
    };
    // The version named, or the one the draft came from; a draft that differs from every version becomes a new one.
    let activeVersion = this.versions.find(matches) ?? this.versions.find(samePlaces);
    if (!activeVersion) {
      const versionNumber = this.nextVersionNumber();
      activeVersion = {
        id: `ver-${versionNumber}`, versionNumber, versionLabel: `Draft V${versionNumber}.0`, createdAt: new Date().toISOString(), createdBy: publisherName,
        changeSummary: 'Published working draft.', reason: 'Publish', isPublished: false, healthScore: this.currentHealth(), sessions: [],
      };
      this.addVersion(activeVersion);
    }
    const activeId = activeVersion.id ?? activeVersion.versionNumber;
    const versionId = activeVersion.versionLabel;
    // The working draft is what was validated, so that is what the published version holds.
    this.versions = this.versions.map((v) => {
      const isActive = (v.id ?? v.versionNumber) === activeId;
      return {
        ...v,
        ...(isActive ? { sessions: this.activeSessions.map((session) => ({ ...session })), sessionsCount: this.activeSessions.length } : {}),
        isPublished: isActive,
        status: isActive ? 'Published' : (v.status === 'Published' ? 'Approved' : v.status),
      };
    });

    const cancelled = new Set(this.activeSessions.filter((session) => session.status === 'Cancelled').map((session) => session.id));
    this.makeupTasks = this.makeupTasks.filter((task) => cancelled.has(task.cancelledSessionId));
    const openTasks = new Set(this.makeupTasks.map((task) => task.id));
    this.recoveryOpportunities = this.recoveryOpportunities.filter((opportunity) => openTasks.has(opportunity.makeupTaskId));

    this.logAudit(publisherName, 'TIMETABLE_PUBLISHED', 'TimetableVersion', versionId, `Timetable version ${versionId} published institution-wide.`);

    this.notifications = this.notifications.filter((notification) => notification.title !== 'Master Schedule Published');
    this.notifications.unshift({
      id: `notif-${Date.now()}`,
      type: 'system_alert',
      title: 'Master Schedule Published',
      message: `Academic Schedule ${this.academicYear.yearLabel} has been officially published.`,
      timestamp: new Date().toISOString(),
      read: false,
      category: 'Success',
    });

    return this.versions.find((v) => v.isPublished)!;
  }

  /** A class can be shown only while its group, course, teacher, room and period still exist. */
  private fitsCurrentData(session: ClassSession): boolean {
    const group = this.groups.get(session.sectionId);
    return Boolean(group)
      && (!session.subSectionId || Boolean(group!.subSections?.some((sub) => sub.id === session.subSectionId)))
      && this.courses.has(session.courseId)
      && this.facultyMembers.has(session.facultyId)
      && this.rooms.has(session.roomId)
      && this.academicYear.timeSlots.some((slot) => slot.id === session.timeSlotId);
  }

  public restoreVersion(versionNumber: number, userId = 'coordinator'): { version?: TimetableVersion; error?: string } {
    const ver = this.versions.find(v => v.versionNumber === versionNumber);
    if (!ver) return { error: `Version ${versionNumber} not found.` };
    const missing = ver.sessions.filter((session) => !this.fitsCurrentData(session)).length;
    if (missing > 0) return { error: `${ver.versionLabel} cannot be restored: ${missing} of its classes use groups, courses, teachers, rooms or periods that no longer exist.` };

    // Restoring loads a draft. Students keep seeing the published version until this one passes validation and is published.
    this.activeSessions = ver.sessions.map((session) => ({ ...session }));
    this.academicYear.publishStatus = 'Draft';
    this.logAudit(userId, 'VERSION_RESTORED', 'TimetableVersion', `v-${versionNumber}`, `Loaded ${ver.versionLabel} as the working draft.`);
    return { version: ver };
  }

  public applyGeneratedCandidate(candidate: GeneratedCandidate, userId = 'coordinator'): TimetableVersion | null {
    if (!candidate?.sessions?.length) return null;
    const validation = validateTimetableIndependently(candidate.sessions, {
      academicYear: this.academicYear,
      allocations: [...this.allocations.values()],
      facultyMembers: [...this.facultyMembers.values()],
      rooms: [...this.rooms.values()],
      sections: [...this.groups.values()],
      courses: [...this.courses.values()],
      constraints: [...this.constraints.values()],
    });
    if (!validation.canPublish) return null;
    const versionNumber = this.nextVersionNumber();
    const sessions = this.numbered(this.keepLocks(candidate.sessions), versionNumber);
    const version: TimetableVersion = {
      id: `ver-${versionNumber}`,
      versionNumber,
      versionLabel: `Draft V${versionNumber}.0`,
      createdAt: new Date().toISOString(),
      createdBy: userId,
      changeSummary: `Generated and validated ${candidate.sessions.length} class sessions.`,
      reason: 'Asynchronous timetable generation',
      isPublished: false,
      status: 'Draft',
      healthScore: candidate.healthScore,
      sessionsCount: candidate.sessions.length,
      hardViolationsCount: validation.hardViolationsCount,
      sessions,
    };
    this.activeSessions = [...sessions];
    this.academicYear.publishStatus = 'Draft';
    this.addVersion(version);
    this.logAudit(userId, 'TIMETABLE_GENERATED', 'TimetableVersion', version.id || `ver-${versionNumber}`, version.changeSummary);
    return version;
  }

  // --------------------------------------------------------------------------
  // RECOVERY, NOTIFICATIONS & REPLACEMENT VOTING
  // --------------------------------------------------------------------------

  public cancelClassSession(sessionId: string, reason: string, userId = 'faculty'): { success: boolean; task?: MakeupTask } {
    const target = this.liveSessions().find(s => s.id === sessionId);
    if (!target) return { success: false };

    const cancelledAt = new Date().toISOString();
    const block = new Set(classBlock(target, this.liveSessions()).map((session) => session.id));
    const cancel = (sessions: ClassSession[]): ClassSession[] => sessions.map(s =>
      block.has(s.id)
        ? {
            ...s,
            status: 'Cancelled',
            statusBeforeCancellation: s.status === 'Cancelled' ? s.statusBeforeCancellation : s.status,
            cancellationReason: reason,
            cancellationTimestamp: cancelledAt,
          }
        : s
    );
    this.updateLiveSessions(cancel);

    const periodOf = (session: ClassSession) => this.academicYear.timeSlots.findIndex((slot) => slot.id === session.timeSlotId);
    const first = this.liveSessions().filter((session) => block.has(session.id)).sort((a, b) => periodOf(a) - periodOf(b))[0];
    const taskId = `makeup-${crypto.randomUUID()}`;
    const newTask: MakeupTask = {
      id: taskId,
      cancelledSessionId: sessionId,
      courseId: target.courseId,
      sectionId: target.sectionId,
      facultyId: target.facultyId,
      cancelledDay: target.day,
      cancelledTimeSlot: target.timeSlotId,
      priorityScore: 95,
      status: 'ProposalsGenerated',
      createdAt: new Date().toISOString(),
    };

    this.makeupTasks.unshift(newTask);

    const opps = findSelfHealingRecoverySlots(
      newTask,
      this.liveSessions(),
      Array.from(this.rooms.values()),
      Array.from(this.facultyMembers.values()),
      Array.from(this.groups.values()),
      Array.from(this.courses.values()),
      this.academicYear
    );

    if (opps.length > 0) {
      this.recoveryOpportunities = [...opps, ...this.recoveryOpportunities];
    }

    this.notifications = this.notifications.filter((notification) => !(notification.type === 'cancellation' && notification.actionPayload?.sessionId === sessionId));
    this.notifications.unshift({
      id: `notif-${Date.now()}`,
      type: 'cancellation',
      title: `Class cancelled: ${this.courseCode(target.courseId)}`,
      recipientRole: 'Student',
      message: `${this.describeClass(first, block.size)} was cancelled. Reason: ${reason}.${opps.length > 0 ? ' Suggested make-up times are available for review.' : ''}`,
      timestamp: new Date().toISOString(),
      read: false,
      category: 'Critical',
      actionable: true,
      actionPayload: { sessionId, sectionId: target.sectionId },
    });

    this.logAudit(userId, 'CLASS_CANCELLED', 'ClassSession', sessionId, `Cancelled ${this.describeClass(first, block.size)}. Reason: ${reason}.`);
    return { success: true, task: newTask };
  }

  public undoClassCancellation(sessionId: string, userId = 'coordinator'): { success: boolean; error?: string } {
    const live = this.liveSessions();
    const target = live.find((session) => session.id === sessionId && session.status === 'Cancelled');
    if (!target) return { success: false, error: 'Cancelled class was not found.' };
    // Bring the class back and drop any make-up that was booked for it.
    const block = new Set(classBlock(target, live).map((session) => session.id));
    const taken = live.find((other) => other.status !== 'Cancelled' && !block.has(other.id) && !block.has(other.originalSessionId ?? '')
      && live.some((session) => block.has(session.id) && sessionsClash(session, other)));
    if (taken) return { success: false, error: `${this.describeClass(taken)} has since been booked at this time. Cancel it first.` };
    const undo = (sessions: ClassSession[]): ClassSession[] => sessions
      .filter((session) => !session.originalSessionId || !block.has(session.originalSessionId))
      .map((session) => block.has(session.id) && session.status === 'Cancelled' ? {
        ...session,
        status: session.statusBeforeCancellation || 'Published',
        statusBeforeCancellation: undefined,
        cancellationReason: undefined,
        cancellationTimestamp: undefined,
      } : session);
    this.updateLiveSessions(undo);
    const taskIds = new Set(this.makeupTasks.filter((task) => block.has(task.cancelledSessionId)).map((task) => task.id));
    this.makeupTasks = this.makeupTasks.filter((task) => !block.has(task.cancelledSessionId));
    this.recoveryOpportunities = this.recoveryOpportunities.filter((opportunity) => !taskIds.has(opportunity.makeupTaskId));
    this.notifications = this.notifications.filter((notification) => !block.has(notification.actionPayload?.sessionId));
    this.logAudit(userId, 'CLASS_CANCELLATION_REVERSED', 'ClassSession', sessionId, `Restored ${this.describeClass(target)} after cancellation.`);
    return { success: true };
  }

  public requestScheduleChange(sessionId: string, details: string, userName = 'Faculty') {
    const target = this.liveSessions().find((session) => session.id === sessionId);
    if (!target) return false;
    const message = `${userName} requested a change to ${this.describeClass(target)}. ${details}`;
    if (this.notifications.some((item) => item.type === 'approval_needed' && !item.read && item.message === message)) return true;
    this.notifications.unshift({
      id: `notif-${crypto.randomUUID()}`,
      type: 'approval_needed',
      title: `Schedule change requested: ${this.courseCode(target.courseId)}`,
      message,
      timestamp: new Date().toISOString(), read: false, category: 'Warning', actionable: true,
      actionPayload: { sessionId, sectionId: target.sectionId },
    });
    this.logAudit(userName, 'SCHEDULE_CHANGE_REQUESTED', 'ClassSession', sessionId, details);
    return true;
  }

  public scheduleMakeupSession(opportunityId: string, userId = 'coordinator'): { success: boolean; session?: ClassSession } {
    const opp = this.recoveryOpportunities.find(o => o.id === opportunityId);
    if (!opp) return { success: false };

    const makeupTask = this.makeupTasks.find(t => t.id === opp.makeupTaskId);
    if (!makeupTask || makeupTask.status === 'Scheduled') return { success: false };

    const run = consecutiveSlots(this.academicYear, opp.timeSlotId, opp.periods ?? 1);
    if (run.length < (opp.periods ?? 1)) return { success: false };
    const cancelledSession = this.liveSessions().find((session) => session.id === makeupTask.cancelledSessionId);
    if (!cancelledSession) return { success: false };
    const newSessions = run.map((timeSlotId): ClassSession => ({
      id: `makeup-sess-${crypto.randomUUID()}`,
      courseId: makeupTask.courseId,
      facultyId: opp.facultyId,
      sectionId: makeupTask.sectionId,
      subSectionId: cancelledSession.subSectionId,
      roomId: opp.roomId,
      day: opp.targetDay,
      timeSlotId,
      type: 'Makeup',
      status: 'Confirmed',
      originalSessionId: makeupTask.cancelledSessionId,
      version: 1,
    }));
    const newSession = newSessions[0];
    const newSessionId = newSession.id;

    this.updateLiveSessions((sessions) => sessions.some((session) => session.id === cancelledSession.id) ? [...sessions, ...newSessions] : sessions);

    this.makeupTasks = this.makeupTasks.map(t =>
      t.id === makeupTask.id ? { ...t, status: 'Scheduled' } : t
    );

    this.recoveryOpportunities = this.recoveryOpportunities.map(o =>
      o.id === opportunityId ? { ...o, status: 'Approved' } : o.makeupTaskId === makeupTask.id ? { ...o, status: 'Rejected' } : o
    );

    const roomObj = this.rooms.get(opp.roomId);
    this.notifications.unshift({
      id: `notif-${Date.now()}`,
      type: 'makeup_request',
      title: `Make-up scheduled: ${this.courseCode(makeupTask.courseId)}`,
      message: `${this.describeClass(newSession, newSessions.length)} in ${roomObj?.name || opp.roomId}.`,
      timestamp: new Date().toISOString(),
      read: false,
      category: 'Success',
      actionPayload: { sessionId: makeupTask.cancelledSessionId, sectionId: makeupTask.sectionId },
    });

    this.logAudit(
      userId,
      'MAKEUP_SCHEDULED',
      'ClassSession',
      newSessionId,
      `Scheduled a make-up: ${this.describeClass(newSession, newSessions.length)} in ${roomObj?.name || opp.roomId}.`
    );

    return { success: true, session: newSession };
  }

  public declineOpportunity(opportunityId: string, userId = 'faculty'): boolean {
    this.recoveryOpportunities = this.recoveryOpportunities.map(o =>
      o.id === opportunityId ? { ...o, status: 'Rejected' } : o
    );
    this.logAudit(userId, 'RECOVERY_DECLINED', 'RecoveryOpportunity', opportunityId, `Declined recovery option ${opportunityId}`);
    return true;
  }

  public castReplacementVote(pollId: string, studentId: string, optionId: string): { success: boolean; message: string } {
    const voteKey = `${pollId}:${studentId}`;
    const poll = this.replacementPolls.find(p => p.id === pollId);
    if (!poll || !poll.isActive) {
      return { success: false, message: 'This replacement poll is inactive or expired.' };
    }
    if (!poll.options.some(option => option.id === optionId)) {
      return { success: false, message: 'The selected option does not belong to this poll.' };
    }

    const previousOptionId = this.replacementVotes.get(voteKey);
    if (previousOptionId === optionId) return { success: true, message: 'Your existing vote is already recorded.' };
    if (previousOptionId) {
      poll.options = poll.options.map(option => option.id === previousOptionId
        ? { ...option, votes: Math.max(0, option.votes - 1) }
        : option.id === optionId ? { ...option, votes: option.votes + 1 } : option);
      this.replacementVotes.set(voteKey, optionId);
      return { success: true, message: 'Your replacement slot vote has been updated.' };
    }

    this.replacementVotes.set(voteKey, optionId);
    poll.votedStudentsCount += 1;
    poll.options = poll.options.map(opt =>
      opt.id === optionId ? { ...opt, votes: opt.votes + 1 } : opt
    );

    return { success: true, message: 'Your replacement slot vote has been securely recorded.' };
  }

  public createReplacementPoll(input: { sectionId: string; courseId: string; question: string; options: Array<{ day: DayOfWeek; timeSlotLabel: string }> }, userId = 'coordinator') {
    const poll: StudentPoll = {
      id: `poll-${crypto.randomUUID()}`,
      makeupTaskId: '',
      courseId: input.courseId,
      sectionId: input.sectionId,
      question: input.question,
      options: input.options.map((option) => ({
        id: `opt-${crypto.randomUUID()}`,
        day: option.day,
        timeSlotLabel: option.timeSlotLabel,
        votes: 0,
        isSystemRecommended: false,
      })),
      totalEligibleStudents: this.groups.get(input.sectionId)?.studentCount || 0,
      votedStudentsCount: 0,
      isActive: true,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    };
    this.replacementPolls.unshift(poll);
    this.notifications.unshift({
      id: `notif-${crypto.randomUUID()}`,
      recipientRole: 'Student',
      type: 'poll_created',
      title: 'New class time poll',
      message: `${input.question} (${this.groups.get(input.sectionId)?.name || input.sectionId})`,
      actionPayload: { sectionId: input.sectionId },
      timestamp: new Date().toISOString(),
      read: false,
      category: 'Info',
    });
    this.logAudit(userId, 'REPLACEMENT_POLL_CREATED', 'StudentPoll', poll.id, `Opened a poll for ${this.courseCode(input.courseId)} in ${this.groups.get(input.sectionId)?.name ?? input.sectionId}.`);
    return poll;
  }

  public closeReplacementPoll(pollId: string, userId = 'coordinator') {
    const poll = this.replacementPolls.find(item => item.id === pollId);
    if (!poll || !poll.isActive) return false;
    poll.isActive = false;
    this.logAudit(userId, 'REPLACEMENT_POLL_CLOSED', 'StudentPoll', poll.id, 'Closed replacement time poll.');
    return true;
  }

  public markNotificationRead(id: string): boolean {
    const notif = this.notifications.find(n => n.id === id);
    if (notif) {
      notif.read = true;
      return true;
    }
    return false;
  }

  private logAudit(userId: string, action: string, entityType: string, entityId: string, details: string) {
    if (action === 'TIMETABLE_PUBLISHED' && this.auditEvents.some((event) => event.action === action && event.entityType === entityType && event.entityId === entityId && Date.now() - Date.parse(event.timestamp) < 5_000)) return;
    this.auditEvents.unshift({
      id: `audit-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
      userId,
      userName: userId,
      action,
      entityType,
      entityId,
      details,
    });
  }
}

// Global Singleton Store Instance
export const supabaseStore = new SupabaseRelationalStore();
