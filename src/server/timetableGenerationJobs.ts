import { randomUUID } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import type { GenerationRoutine, OptimizationProfile } from '../types';
import { supabaseStore } from './supabaseStore';

export type TimetableGenerationJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface TimetableGenerationJob {
  jobId: string;
  status: TimetableGenerationJobStatus;
  progress: number;
  phase: string;
  createdAt: string;
  updatedAt: string;
  result?: {
    success: boolean;
    isFeasible: boolean;
    routines: GenerationRoutine[];
    sessionsGenerated: number;
    timestamp: string;
    error?: string;
    infeasibilityDiagnostics?: string[];
  };
  error?: string;
}

type JobPayload = {
  budgetMode: 'FAST' | 'BALANCED' | 'MAXIMUM_OPTIMIZATION';
  timeBudgetMs: number;
  routines: Array<{ id: string; label: string; description?: string; optimizationProfile: OptimizationProfile; seed: number }>;
  userId: string;
};

const jobs = new Map<string, TimetableGenerationJob>();
const workers = new Map<string, Worker>();
const MAX_JOB_AGE_MS = 60 * 60 * 1000;

function now() { return new Date().toISOString(); }

export function startTimetableGenerationJob(payload: JobPayload): TimetableGenerationJob {
  const jobId = randomUUID();
  const timestamp = now();
  const job: TimetableGenerationJob = {
    jobId,
    status: 'queued',
    progress: 0,
    phase: 'queued',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  jobs.set(jobId, job);

  const state = supabaseStore.getBootstrapState();
  const workerPayload = {
    academicYear: state.academicYear,
    allocations: state.allocations,
    facultyMembers: state.facultyMembers,
    rooms: state.rooms,
    sections: state.sections,
    courses: state.courses,
    constraints: state.constraints,
    budgetMode: payload.budgetMode,
    timeBudgetMs: payload.timeBudgetMs,
    routines: payload.routines,
  };

  const worker = new Worker(new URL('./timetableGenerationWorker.ts', import.meta.url), {
    type: 'module',
    execArgv: ['--import', 'tsx'],
    workerData: workerPayload,
  });
  workers.set(jobId, worker);

  job.status = 'running';
  job.phase = 'solving';
  job.updatedAt = now();

  worker.on('message', (message: any) => {
    const current = jobs.get(jobId);
    if (!current) return;
    if (message.type === 'progress') {
      current.progress = Number(message.progress) || 0;
      current.phase = String(message.phase || 'solving');
      current.updatedAt = now();
      return;
    }
    if (message.type === 'failed') {
      current.status = 'failed';
      current.progress = 100;
      current.phase = 'failed';
      current.error = String(message.error || 'Generation worker failed.');
      current.updatedAt = now();
      workers.delete(jobId);
      return;
    }
    if (message.type === 'completed') {
      try {
        const routines = (message.routines || []).map((r: any, index: number) => supabaseStore.persistGeneratedRoutine({
          ...r,
          candidate: r.candidate,
        }, payload.userId, index === 0));
        const feasible = routines.every(r => r.validation.valid);
        current.status = feasible ? 'completed' : 'failed';
        current.progress = 100;
        current.phase = feasible ? 'complete' : 'infeasible';
        current.result = {
          success: feasible,
          isFeasible: feasible,
          routines,
          sessionsGenerated: routines[0]?.sessions.length || 0,
          timestamp: now(),
          ...(feasible ? {} : {
            error: 'No generated routine passed the independent validation gate.',
            infeasibilityDiagnostics: routines.flatMap(r => r.validation.blockingReasons || []),
          }),
        };
        if (!feasible) current.error = current.result.error;
        current.updatedAt = now();
      } catch (error) {
        current.status = 'failed';
        current.phase = 'persist-failed';
        current.error = error instanceof Error ? error.message : String(error);
        current.updatedAt = now();
      } finally {
        workers.delete(jobId);
      }
    }
  });

  worker.on('error', (error) => {
    const current = jobs.get(jobId);
    if (!current) return;
    current.status = 'failed';
    current.phase = 'worker-error';
    current.error = error.message;
    current.updatedAt = now();
    workers.delete(jobId);
  });

  worker.on('exit', (code) => {
    if (code !== 0) {
      const current = jobs.get(jobId);
      if (current && current.status === 'running') {
        current.status = 'failed';
        current.phase = 'worker-exit';
        current.error = 'Generation worker exited unexpectedly.';
        current.updatedAt = now();
      }
    }
    workers.delete(jobId);
  });

  cleanupJobs();
  return { ...job };
}

export function getTimetableGenerationJob(jobId: string): TimetableGenerationJob | undefined {
  cleanupJobs();
  const job = jobs.get(jobId);
  return job ? { ...job, result: job.result ? { ...job.result, routines: [...job.result.routines] } : undefined } : undefined;
}

export async function cancelTimetableGenerationJob(jobId: string): Promise<TimetableGenerationJob | undefined> {
  const job = jobs.get(jobId);
  if (!job) return undefined;
  const worker = workers.get(jobId);
  if (worker) {
    await worker.terminate();
    workers.delete(jobId);
  }
  job.status = 'cancelled';
  job.phase = 'cancelled';
  job.progress = Math.min(100, job.progress);
  job.updatedAt = now();
  return { ...job };
}

function cleanupJobs() {
  const cutoff = Date.now() - MAX_JOB_AGE_MS;
  for (const [jobId, job] of jobs) {
    if (Date.parse(job.updatedAt) < cutoff && (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled')) {
      jobs.delete(jobId);
    }
  }
}
