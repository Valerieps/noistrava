import { useCallback, useEffect, useRef, useState } from 'react';
import type { ApiError, QueryName, Queries, Topic } from '../application/api-contract';
import { useServices } from './backend-context';

export interface QueryState<T> {
  readonly data: T | undefined;
  readonly error: ApiError | undefined;
  readonly loading: boolean;
  readonly reload: () => void;
}

/**
 * Loads a query and refetches it whenever the live connection says one of `topics` changed.
 * On failure the last data stays on screen (offline: "mostra o último estado carregado").
 */
export function useQuery<N extends QueryName>(name: N, input: Queries[N]['input'], topics: readonly Topic[]): QueryState<Queries[N]['output']> {
  const { backend, live } = useServices();
  const [data, setData] = useState<Queries[N]['output']>();
  const [error, setError] = useState<ApiError>();
  const [loading, setLoading] = useState(true);
  const inputKey = JSON.stringify(input);
  const topicsKey = topics.join(',');
  const latest = useRef(0);

  const load = useCallback(() => {
    const call = ++latest.current;
    setLoading(true);
    void backend.query(name, JSON.parse(inputKey) as Queries[N]['input']).then((result) => {
      if (call !== latest.current) return;
      setLoading(false);
      if (result.ok) {
        setData(result.value);
        setError(undefined);
      } else {
        setError(result.error);
      }
    });
  }, [backend, name, inputKey]);

  useEffect(load, [load]);

  useEffect(() => {
    const watched = topicsKey.split(',');
    return live.subscribe((changed) => {
      if (changed.some((t) => watched.includes(t))) load();
    });
  }, [live, load, topicsKey]);

  return { data, error, loading, reload: load };
}
