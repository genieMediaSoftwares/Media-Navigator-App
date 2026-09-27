import Ionicons from '@expo/vector-icons/Ionicons';
import { ComponentProps, ReactNode } from 'react';

import { ResourceState } from '@/hooks/useApiResource';

import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';

interface AsyncContentProps<T> {
  state: ResourceState<T>;
  onRetry: () => void;
  /** Skeleton or LoadingState matching the success layout. */
  loading: ReactNode;
  /** Shown when the Worker reports the feature is not built yet; the message comes from the API. */
  unavailable: {
    icon: ComponentProps<typeof Ionicons>['name'];
    title: string;
    action?: { label: string; onPress: () => void };
  };
  isEmpty: (data: T) => boolean;
  empty: ReactNode;
  children: (data: T) => ReactNode;
}

/** Renders exactly one of loading / unavailable / error / empty / success for an API resource. */
export function AsyncContent<T>({ state, onRetry, loading, unavailable, isEmpty, empty, children }: AsyncContentProps<T>) {
  switch (state.status) {
    case 'loading':
      return <>{loading}</>;
    case 'unavailable':
      return <EmptyState icon={unavailable.icon} title={unavailable.title} message={state.message} action={unavailable.action} />;
    case 'error':
      return <ErrorState message={state.message} onRetry={onRetry} />;
    case 'success':
      return <>{isEmpty(state.data) ? empty : children(state.data)}</>;
  }
}
