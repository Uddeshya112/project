import { Worker } from 'node:worker_threads';
import type { Db } from './db';
import type { EngineResult, EngineOptions } from '../lib/optimizationEngine';
import type { AcademicYearConfig, CourseAllocation, Faculty, Room, StudentSection, Course, AcademicConstraint } from '../types';

export type JobStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export interface TimetableJobState {
  jobId: string;
  status: JobStatus;
  progress: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  result?: EngineResult;
  error?: string;
}

type StoredJobPayload = {
  academicYear: AcademicYearConfig;
  allocations: CourseAllocation[];
  facultyMembers: Faculty[];
  rooms: Room[];
  sections: StudentSection[];
  courses: Course[];
  constraints: AcademicConstraint[];
  options: EngineOptions;
};

export class TimetableJobManager {
  private readonly workers = new Map<string, Worker>();

  constructor(private readonly db: Db) {}

  async init() {
    await this.db.query(
      \`update intellischedule.timetable_jobs
       set status = 'FAILED',
           error = 'Server restarted while the job was running.',
           completed_at = now(),
           progress = 100
       where status = 'RUNNING'\`,
    );
    const pending = await this.db.query<{ job_id: string; payload: StoredJobPayload }>(
      \`select job_id, payload from intellischedule.timetable_jobs where status = 'PENDING' order by created_at asc\`,
    );
    for (const job of pending) this.spawn(job.job_id, job.payload);
  }

  async createJob(payload: StoredJobPayload): Promise<string> {
    const jobId = \`job_\${Date.now()}_\${crypto.randomUUID().slice(0, 8)}\`;
    await this.db.query(
      \`insert into intellischedule.timetable_jobs
       (job_id, status, progress, payload, created_at)
       values ($1, 'PENDING', 0, $2, now())\`,
      [jobId, payload],
    );
    this.spawn(jobId, payload);
    return jobId;
  }

  async getJob(jobId: string): Promise<TimetableJobState | undefined> {
    const rows = await this.db.query<any>(
      \`select job_id, status, progress, created_at, started_at, completed_at, result, error
       from intellischedule.timetable_jobs where job_id = $1\`,
      [jobId],
    );
    const row = rows[0];
    if (!row) return undefined;
    return {
      jobId: row.job_id,
      status: row.status,
      progress: Number(row.progress) || 0,
      createdAt: new Date(row.created_at).toISOString(),
      startedAt: row.started_at ? new Date(row.started_at).toISOString() : undefined,
      completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : undefined,
      result: row.result ?? undefined,
      error: row.error ?? undefined,
    };
  }

  async cancelJob(jobId: string): Promise<boolean> {
    const rows = await this.db.query<{ status: JobStatus }>(
      \`select status from intellischedule.timetable_jobs where job_id = $1\`,
      [jobId],
    );
    const current = rows[0]?.status;
    if (!current || current === 'COMPLETED' || current === 'FAILED' || current === 'CANCELLED') return false;

    await this.db.query(
      \`update intellischedule.timetable_jobs
       set status = 'CANCELLED', progress = 100, completed_at = now(), error = 'Cancelled by user.'
       where job_id = $1 and status in ('PENDING','RUNNING')\`,
      [jobId],
    );
    const worker = this.workers.get(jobId);
    if (worker) {
      this.workers.delete(jobId);
      await worker.terminate().catch(() => {});
    }
    return true;
  }

  private spawn(jobId: string, payload: StoredJobPayload) {
    if (this.workers.has(jobId)) return;

    const workerUrl = new URL('./timetableGenerationWorker.ts', import.meta.url);
    const worker = new Worker(workerUrl, {
      type: 'module',
      workerData: payload,
      execArgv: process.execArgv,
    });
    this.workers.set(jobId, worker);

    worker.on('message', async (message: any) => {
      try {
        if (message?.type === 'started') {
          await this.db.query(
            \`update intellischedule.timetable_jobs
             set status = 'RUNNING', progress = 10, started_at = coalesce(started_at, now())
             where job_id = $1 and status = 'PENDING'\`,
            [jobId],
          );
          return;
        }

        if (message?.type === 'completed') {
          await this.db.query(
            \`update intellischedule.timetable_jobs
             set status = 'COMPLETED', progress = 100, completed_at = now(), result = $2
             where job_id = $1 and status <> 'CANCELLED'\`,
            [jobId, message.result],
          );
          this.workers.delete(jobId);
          await worker.terminate().catch(() => {});
          return;
        }

        if (message?.type === 'failed') {
          await this.db.query(
            \`update intellischedule.timetable_jobs
             set status = 'FAILED', progress = 100, completed_at = now(), error = $2
             where job_id = $1 and status <> 'CANCELLED'\`,
            [jobId, String(message.error || 'Worker failed.')],
          );
          this.workers.delete(jobId);
          await worker.terminate().catch(() => {});
        }
      } catch (error: any) {
        await this.db.query(
          \`update intellischedule.timetable_jobs
           set status = 'FAILED', progress = 100, completed_at = now(), error = $2
           where job_id = $1 and status <> 'CANCELLED'\`,
          [jobId, error?.message || 'Unable to persist job state.'],
        ).catch(() => {});
        this.workers.delete(jobId);
      }
    });

    worker.on('error', async (error) => {
      await this.db.query(
        \`update intellischedule.timetable_jobs
         set status = 'FAILED', progress = 100, completed_at = now(), error = $2
         where job_id = $1 and status <> 'CANCELLED'\`,
        [jobId, error.message],
      ).catch(() => {});
      this.workers.delete(jobId);
    });

    worker.on('exit', async (code) => {
      if (this.workers.get(jobId) !== worker) return;
      this.workers.delete(jobId);
      if (code !== 0) {
        await this.db.query(
          \`update intellischedule.timetable_jobs
           set status = 'FAILED', progress = 100, completed_at = now(), error = $2
           where job_id = $1 and status in ('PENDING','RUNNING')\`,
          [jobId, \`Worker exited with code \${code}.\`],
        ).catch(() => {});
      }
    });
  }
}
