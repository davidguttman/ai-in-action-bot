/**
 * Single-process locking utility to prevent overlapping job runs.
 * Uses in-memory locks keyed by job name.
 *
 * For multi-instance deployments, this should be replaced with
 * a distributed lock (e.g., MongoDB-based).
 */

const locks = new Map()

/**
 * Acquire a lock for a job. Returns true if lock was acquired, false if already locked.
 * @param {string} jobName - Name of the job to lock
 * @returns {boolean} - True if lock acquired, false if already locked
 */
function acquireLock(jobName) {
  if (locks.has(jobName)) {
    return false
  }
  locks.set(jobName, Date.now())
  return true
}

/**
 * Release a lock for a job.
 * @param {string} jobName - Name of the job to unlock
 */
function releaseLock(jobName) {
  locks.delete(jobName)
}

/**
 * Check if a job is currently locked.
 * @param {string} jobName - Name of the job to check
 * @returns {boolean} - True if locked, false if not locked
 */
function isLocked(jobName) {
  return locks.has(jobName)
}

/**
 * Get the timestamp when a lock was acquired.
 * @param {string} jobName - Name of the job
 * @returns {number|null} - Timestamp or null if not locked
 */
function getLockTime(jobName) {
  return locks.get(jobName) || null
}

module.exports = {
  acquireLock,
  releaseLock,
  isLocked,
  getLockTime,
}
