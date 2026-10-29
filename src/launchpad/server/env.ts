/**
 * Read a server environment variable from the real Node `process`.
 * The client-side polyfill plugin rewrites bare `process` references to a shim,
 * so server code must go through globalThis to see Vercel environment variables.
 */
export function serverEnv(key: string): string | undefined {
  const value = (globalThis as any)['process']?.env?.[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
