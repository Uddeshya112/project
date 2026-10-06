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
import { executeOptimizationEngine } from '../lib/optimizationEngine';
import { findSelfHealingRecoverySlots } from '../lib/recoveryEngine';
import { ExcelImportPreview } from '../lib/excelMasterService';
import type { Db } from './db';

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
  private activeSessions: ClassSession[] = [];
  private notifications: NotificationItem[] = [];
  private auditEvents: AuditLog[] = [];
  private makeupTasks: MakeupTask[] = [];
  private recoveryOpportunities: RecoveryOpportunity[] = [];
  private replacementPolls: StudentPoll[] = [];
  private replacementVotes: Map<string, string> = new Map(); // "pollId:studentId" -> optionId

  private db: Db | null = null;
  private persistChain: Promise<void> = Promise.resolve();
  private lastPersistedSnapshot = '';
  private persistenceTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.seedInitialDatabase();
  }

  async init(db: Db): Promise<void> {
    this.db = db;
    const rows = await db.query<{ key: string; data: any }>('select key, data from intellischedule.app_state');
    const byKey = new Map(rows.map(row => [row.key, row.data]));
    const academic = byKey.get('academic');
    if (academic) {
      const byId = <V extends { id: string }>(items: V[] = []) => new Map(items.map(item => [item.id, item]));
      this.academicYear = academic.academicYear ?? this.academicYear;
      this.departments = byId(academic.departments);
      this.programs = byId(academic.programs);
      this.courses = byId(academic.courses);
      this.facultyMembers = byId(academic.facultyMembers);
      this.rooms = byId(academic.rooms);
      this.groups = byId(academic.sections ?? academic.groups);
      this.allocations = byId(academic.allocations);
      this.constraints = byId(academic.constraints);
      const students = byKey.get('students');
      this.students = byId(students);
      const timetable = byKey.get('timetable') ?? {};
      this.activeSessions = timetable.activeSessions ?? this.activeSessions;
      this.versions = timetable.versions ?? this.versions;
      const operations = byKey.get('operations') ?? {};
      this.notifications = operations.notifications ?? this.notifications;
      this.makeupTasks = operations.makeupTasks ?? this.makeupTasks;
      this.recoveryOpportunities = operations.recoveryOpportunities ?? this.recoveryOpportunities;
      this.replacementPolls = operations.polls ?? operations.replacementPolls ?? this.replacementPolls;
      this.replacementVotes = new Map(operations.votes ?? operations.replacementVotes ?? []);
      this.auditEvents = operations.auditLogs ?? this.auditEvents;
      this.lastPersistedSnapshot = this.snapshot();
    } else {
      await this.flush();
    }
    if (!this.persistenceTimer) {
      this.persistenceTimer = setInterval(() => { void this.flush(); }, 1000);
      this.persistenceTimer.unref();
    }
  }

  private snapshot(): string {
    return JSON.stringify({
      academic: {
        academicYear: this.academicYear,
        departments: [...this.departments.values()],
        programs: [...this.programs.values()],
        courses: [...this.courses.values()],
        facultyMembers: [...this.facultyMembers.values()],
        rooms: [...this.rooms.values()],
        sections: [...this.groups.values()],
        allocations: [...this.allocations.values()],
        constraints: [...this.constraints.values()],
      },
      students: [...this.students.values()],
      timetable: { activeSessions: this.activeSessions, versions: this.versions },
      operations: {
        notifications: this.notifications,
        makeupTasks: this.makeupTasks,
        recoveryOpportunities: this.recoveryOpportunities,
        polls: this.replacementPolls,
        votes: [...this.replacementVotes.entries()],
        auditLogs: this.auditEvents.slice(0, 500),
      },
    });
  }

  private flush(): Promise<void> {
    if (!this.db) return Promise.resolve();
    const snapshot = this.snapshot();
    if (snapshot === this.lastPersistedSnapshot) return this.persistChain;
    this.persistChain = this.persistChain.then(async () => {
      const doc = JSON.parse(snapshot) as Record<string, unknown>;
      await this.db!.tx(async q => {
        for (const [key, data] of Object.entries(doc)) {
          await q(
            `insert into intellischedule.app_state (key, data) values ($1, $2::jsonb) on conflict (key) do update set data = excluded.data, updated_at = now(), version = intellischedule.app_state.version + 1`,
            [key, JSON.stringify(data)],
          );
        }
      });
      this.lastPersistedSnapshot = snapshot;
    }).catch(err => {
      console.error('[STORE] Persistence error:', err instanceof Error ? err.message : String(err));
    });
    return this.persistChain;
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

    // 4. Rooms
    this.rooms.clear();