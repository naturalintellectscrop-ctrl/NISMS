/**
 * Sliding-window login throttle. In-memory: per serverless instance, which
 * still blunts brute force per warm instance; swap for Redis/Upstash when
 * fleet size warrants shared state.
 */
const attempts = new Map<string, number[]>();

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

function prune(now: number, timestamps: number[]): number[] {
  return timestamps.filter((t) => now - t < WINDOW_MS);
}

/** Returns true if this key is currently locked out. */
export function isRateLimited(key: string): boolean {
  const now = Date.now();
  const recent = prune(now, attempts.get(key) ?? []);
  attempts.set(key, recent);
  return recent.length >= MAX_ATTEMPTS;
}

/** Records a failed attempt against the key. */
export function recordFailure(key: string): void {
  const now = Date.now();
  const recent = prune(now, attempts.get(key) ?? []);
  recent.push(now);
  attempts.set(key, recent);

  // Opportunistic cleanup so the map cannot grow unbounded.
  if (attempts.size > 10_000) {
    for (const [k, v] of attempts) {
      if (prune(now, v).length === 0) attempts.delete(k);
    }
  }
}

/** Clears failures after a successful login. */
export function clearFailures(key: string): void {
  attempts.delete(key);
}

export function loginKeys(ip: string, email: string): string[] {
  return [`ip:${ip}`, `acct:${email.toLowerCase()}`];
}
