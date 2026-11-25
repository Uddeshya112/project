import { Worker } from 'node:worker_threads';
import type { EngineResult } from '../lib/optimizationEngine';
import { AcademicYearConfig, CourseAllocation, Faculty, Room, StudentSection, Course, AcademicConstraint, ClassSession } from '../types';

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
    fixedSessions?: ClassSession[];
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

/** The search goes one call deeper per placed class, so large timetables need more than the default 4 MB of stack. */
const startSolverWorker = (request: TimetableJobRequest) => new Worker(new URL('./solverWorker.ts', import.meta.url), {
  workerData: request,
  execArgv: process.execArgv.filter((arg) => !arg.startsWith('--input-type')),
  resourceLimits: { stackSizeMb: 32 },
});

class TimetableJobManager {
  /** Solve without blocking other requests. */
  public solve(request: Omit<TimetableJobRequest, 'jobId'>, timeoutMs: number): Promise<EngineResult> {
    return new Promise((resolve, reject) => {
      const worker = startSolverWorker({ ...request, jobId: 'sync' });
      const finish = (action: () => void) => { clearTimeout(timer); action(); void worker.terminate(); };
      const timer = setTimeout(() => finish(() => reject(new Error('The solver did not finish in time.'))), timeoutMs);
      worker.once('message', (message: { result?: EngineResult; error?: string }) =>
        finish(() => message.result ? resolve(message.result) : reject(new Error(message.error || 'The solver returned no result.'))));
      worker.once('error', (error) => finish(() => reject(error)));
    });
  }

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
    // Finished jobs hold whole timetables, so only recent ones are kept.
    const finished = [...this.jobs.values()].filter((job) => !['PENDING', 'RUNNING'].includes(job.status));
    for (const job of finished.slice(0, Math.max(0, finished.length - 9))) this.jobs.delete(job.jobId);
    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const jobState: TimetableJobState = {
      jobId,
      status: 'PENDING',
      progress: 0,
      createdAt: new Date().toISOString(),
    };

    this.jobs.set(jobId, jobState);

    setImmediate(() => {
      const job = this.jobs.get(jobId);
      if (!job || job.status === 'CANCELLED') return;
      job.status = 'RUNNING';
      job.startedAt = new Date().toISOString();
      job.progress = 10;
      const worker = startSolverWorker({ jobId, academicYear, allocations, facultyMembers, rooms, sections, courses, constraints, options });
      job.worker = worker;
      worker.on('message', (message: { result?: EngineResult; error?: string }) => {
        const active = this.jobs.get(jobId);
        if (!active || active.status === 'CANCELLED') return;
        if (message.error || !message.result) {
          active.status = 'FAILED';
          active.error = message.error || 'Solver worker returned no result.';
        } else {
          active.status = 'COMPLETED';
          active.progress = 100;
          active.result = message.result;
        }
        active.completedAt = new Date().toISOString();
        active.worker = undefined;
        void worker.terminate();
      });
      worker.on('error', (error) => {
        const active = this.jobs.get(jobId);
        if (!active || active.status === 'CANCELLED') return;
        active.status = 'FAILED';
        active.error = error.message;
        active.completedAt = new Date().toISOString();
        active.worker = undefined;
      });
      worker.on('exit', (code) => {
        const active = this.jobs.get(jobId);
        if (active && active.status === 'RUNNING' && code !== 0) {
          active.status = 'FAILED';
          active.error = `Solver worker exited unexpectedly (${code}).`;
          active.completedAt = new Date().toISOString();
          active.worker = undefined;
        }
      });
    });

    return jobId;
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
