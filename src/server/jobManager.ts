import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { executeOptimizationEngine, EngineResult } from '../lib/optimizationEngine';
import { AcademicYearConfig, CourseAllocation, Faculty, Room, StudentSection, Course, AcademicConstraint } from '../types';

export interface TimetableJobRequest {
  jobId: string;
  academicYear: AcademicYearConfig;
  allocations: CourseAllocation[];
  facultyMembers: Faculty[];
  rooms: Room[];
  sections: StudentSection[];
  courses: Course[];
  constraints: AcademicConstraint[];
  options: {
    budgetMode?: 'FAST' | 'BALANCED' | 'MAXIMUM_OPTIMIZATION';
    optimizationProfile?: 'STUDENT_FOCUSED' | 'FACULTY_FOCUSED' | 'BALANCED';
    timeBudgetMs?: number;
    seed?: number;
    maxCandidates?: number;
  };
}

export type JobStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export interface TimetableJobState {
  jobId: string;
  status: JobStatus;
  progress: number; // 0 - 100%
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  result?: EngineResult;
  error?: string;
  worker?: Worker;
}

class TimetableJobManager {
  private jobs = new Map<string, TimetableJobState>();

  public createJob(
    academicYear: AcademicYearConfig,
    allocations: CourseAllocation[],
    facultyMembers: Faculty[],
    rooms: Room[],
    sections: StudentSection[],
    courses: Course[],
    constraints: AcademicConstraint[],
    options: any = {}
  ): string {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const jobState: TimetableJobState = {
      jobId,
      status: 'PENDING',
      progress: 0,
      createdAt: new Date().toISOString(),
    };

    this.jobs.set(jobId, jobState);

    // Execute asynchronously using setImmediate / background execution to keep event loop unblocked
    setImmediate(() => {
      this.executeJob(jobId, {
        jobId,
        academicYear,
        allocations,
        facultyMembers,
        rooms,
        sections,
        courses,
        constraints,
        options,
      });
    });

    return jobId;
  }

  private executeJob(jobId: string, payload: TimetableJobRequest) {
    const job = this.jobs.get(jobId);
    if (!job || job.status === 'CANCELLED') return;

    job.status = 'RUNNING';
    job.startedAt = new Date().toISOString();
    job.progress = 25;

    try {
      // Deterministic solve
      const result = executeOptimizationEngine(
        payload.academicYear,
        payload.allocations,
        payload.facultyMembers,
        payload.rooms,
        payload.sections,
        payload.courses,
        payload.constraints,
        payload.options
      );

      const currentJob = this.jobs.get(jobId);
      if (!currentJob || currentJob.status === 'CANCELLED') return;

      currentJob.status = 'COMPLETED';
      currentJob.progress = 100;
      currentJob.completedAt = new Date().toISOString();
      currentJob.result = result;
    } catch (err: any) {
      const currentJob = this.jobs.get(jobId);
      if (!currentJob || currentJob.status === 'CANCELLED') return;
      currentJob.status = 'FAILED';
      currentJob.error = err?.message || 'Unknown error occurred during generation';
      currentJob.completedAt = new Date().toISOString();
    }
  }

  public getJob(jobId: string): TimetableJobState | undefined {
    const job = this.jobs.get(jobId);
    if (!job) return undefined;
    const { worker, ...safeState } = job;
    return safeState as TimetableJobState;
  }

  public cancelJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job) return false;
    if (job.status === 'COMPLETED' || job.status === 'FAILED') return false;

    job.status = 'CANCELLED';
    job.completedAt = new Date().toISOString();
    if (job.worker) {
      job.worker.terminate().catch(() => {});
    }
    return true;
  }
}

export const timetableJobManager = new TimetableJobManager();
