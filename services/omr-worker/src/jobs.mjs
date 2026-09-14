/**
 * In-memory recognition job store for the local / containerised OMR worker.
 * Production can swap this for Redis later without changing the HTTP API.
 */

import { randomUUID } from "node:crypto";

/** @typedef {"queued" | "processing" | "completed" | "failed"} JobStatus */

/**
 * @typedef {object} Job
 * @property {string} id
 * @property {JobStatus} status
 * @property {string} [musicXml]
 * @property {string} [error] User-facing message
 * @property {string} [internalError] Logged only
 * @property {number} createdAt
 * @property {number} updatedAt
 * @property {string} workDir
 */

/** @type {Map<string, Job>} */
const jobs = new Map();

export function createJob(workDir) {
  const id = randomUUID();
  const now = Date.now();
  /** @type {Job} */
  const job = {
    id,
    status: "queued",
    createdAt: now,
    updatedAt: now,
    workDir,
  };
  jobs.set(id, job);
  return job;
}

export function getJob(id) {
  return jobs.get(id) ?? null;
}

/**
 * @param {string} id
 * @param {Partial<Job>} patch
 */
export function updateJob(id, patch) {
  const job = jobs.get(id);
  if (!job) return null;
  Object.assign(job, patch, { updatedAt: Date.now() });
  return job;
}

export function listJobs() {
  return [...jobs.values()];
}

/** Drop finished jobs older than maxAgeMs (and their map entries). */
export function pruneJobs(maxAgeMs) {
  const cutoff = Date.now() - maxAgeMs;
  for (const [id, job] of jobs) {
    if (
      (job.status === "completed" || job.status === "failed") &&
      job.updatedAt < cutoff
    ) {
      jobs.delete(id);
    }
  }
}

export function publicJobView(job) {
  return {
    id: job.id,
    status: job.status,
    ...(job.status === "completed" && job.musicXml
      ? { musicXml: job.musicXml }
      : {}),
    ...(job.status === "failed"
      ? { error: job.error || "We couldn’t read the notes from this page." }
      : {}),
  };
}
