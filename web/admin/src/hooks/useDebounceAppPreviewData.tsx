import { useAppDispatch } from '@/store';
import { setAppPreviewData } from '@/store/slices/config';
import { debounce } from 'lodash-es';
import { useEffect, useMemo } from 'react';

type PendingDebouncedDispatch = {
  (data: unknown): void;
  cancel: () => void;
  flush: () => void;
};

const pendingPreviewData = new Map<PendingDebouncedDispatch, unknown>();
const pendingDispatchers = new Set<PendingDebouncedDispatch>();

export const flushPendingAppPreviewData = <T,>(fallback: T): T => {
  let latest = fallback;
  pendingPreviewData.forEach(data => {
    latest = data as T;
  });

  pendingDispatchers.forEach(dispatcher => {
    dispatcher.flush();
  });
  pendingPreviewData.clear();

  return latest;
};

const useDebounceAppPreviewData = () => {
  const dispatch = useAppDispatch();

  const debouncedDispatch = useMemo<PendingDebouncedDispatch>(() => {
    const dispatcherRef = {
      current: undefined as PendingDebouncedDispatch | undefined,
    };
    const debounced = debounce((data: unknown) => {
      if (dispatcherRef.current) {
        pendingPreviewData.delete(dispatcherRef.current);
      }
      dispatch(setAppPreviewData(data));
    }, 500);

    const dispatcher = ((data: unknown) => {
      pendingPreviewData.delete(dispatcher);
      pendingPreviewData.set(dispatcher, data);
      debounced(data);
    }) as PendingDebouncedDispatch;
    dispatcherRef.current = dispatcher;

    dispatcher.cancel = () => {
      pendingPreviewData.delete(dispatcher);
      debounced.cancel();
    };

    dispatcher.flush = () => {
      pendingPreviewData.delete(dispatcher);
      debounced.flush();
    };

    return dispatcher;
  }, [dispatch]);

  useEffect(() => {
    pendingDispatchers.add(debouncedDispatch);
    return () => {
      debouncedDispatch.flush();
      pendingDispatchers.delete(debouncedDispatch);
    };
  }, [debouncedDispatch]);

  return debouncedDispatch;
};

export default useDebounceAppPreviewData;
