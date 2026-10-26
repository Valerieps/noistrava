import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { LiveStatus, Backend, LiveUpdates } from '../application/ports';

interface Services {
  readonly backend: Backend;
  readonly live: LiveUpdates;
}

const ServicesContext = createContext<Services | null>(null);

export function ServicesProvider({ backend, live, children }: Services & { children: ReactNode }) {
  return <ServicesContext.Provider value={{ backend, live }}>{children}</ServicesContext.Provider>;
}

export function useServices(): Services {
  const services = useContext(ServicesContext);
  if (!services) throw new Error('ServicesProvider is missing');
  return services;
}

export function useLiveStatus(): LiveStatus {
  const { live } = useServices();
  const [status, setStatus] = useState<LiveStatus>('connecting');
  useEffect(() => live.onStatus(setStatus), [live]);
  return status;
}
