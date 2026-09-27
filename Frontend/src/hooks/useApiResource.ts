import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError } from '@/lib/api/client';

export type ResourceState<T> =
  | { status: 'loading' }
  /** The Worker reported the feature is not built yet (501 FEATURE_NOT_AVAILABLE). */
  | { status: 'unavailable'; message: string }
  /** `code` is the Worker's machine-readable error code (e.g. AI_UNAVAILABLE), when there was a response. */
  | { status: 'error'; message: string; code?: string }
  | { status: 'success'; data: T };

function toFailureState(error: unknown): ResourceState<never> {
  if (error instanceof ApiError && error.status === 501) return { status: 'unavailable', message: error.message };
  if (error instanceof ApiError) return { status: 'error', message: error.message, code: error.code };
  return { status: 'error', message: error instanceof Error ? error.message : 'Something went wrong.' };
}

/**
 * Loads one API resource and exposes loading / unavailable / error / success states.
 * `fetcher` must be stable (a module-level service function). Failures are never replaced with
 * fallback data: a failed refresh replaces the previous data with the error state.
 */
export function useApiResource<T>(fetcher: () => Promise<T>) {
  const [state, setState] = useState<ResourceState<T>>({ status: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const mounted = useRef(true);

  const run = useCallback(
    async (mode: 'load' | 'refresh') => {
      if (mode === 'load') setState({ status: 'loading' });
      else setRefreshing(true);
      try {
        const data = await fetcher();
        if (mounted.current) setState({ status: 'success', data });
      } catch (error) {
        if (mounted.current) setState(toFailureState(error));
      } finally {
        if (mounted.current) setRefreshing(false);
      }
    },
    [fetcher],
  );

  useEffect(() => {
    mounted.current = true;
    void run('load');
    return () => {
      mounted.current = false;
    };
  }, [run]);

  const reload = useCallback(() => run('load'), [run]);
  const refresh = useCallback(() => run('refresh'), [run]);

  return { state, refreshing, reload, refresh };
}
