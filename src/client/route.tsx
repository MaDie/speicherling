import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

type LocationValue = {
  pathname: string;
  search: string;
  navigate: (to: string) => void;
};

const LocationContext = createContext<LocationValue | null>(null);

export function LocationProvider({ children }: { children: ReactNode }) {
  const [href, setHref] = useState(() => window.location.pathname + window.location.search);

  useEffect(() => {
    const sync = () => setHref(window.location.pathname + window.location.search);
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  const navigate = useCallback((to: string) => {
    window.history.pushState({}, "", to);
    const next = to.startsWith("http") ? new URL(to).pathname + new URL(to).search : to;
    setHref(next);
  }, []);

  const value = useMemo<LocationValue>(() => {
    const url = new URL(href, window.location.origin);
    return { pathname: url.pathname, search: url.search, navigate };
  }, [href, navigate]);

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

export function useLocation(): LocationValue {
  const value = useContext(LocationContext);
  if (!value) throw new Error("useLocation outside provider");
  return value;
}
