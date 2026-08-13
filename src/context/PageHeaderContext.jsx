import { createContext, useCallback, useContext, useMemo, useState, useRef } from 'react';

const PageHeaderContext = createContext(null);

export function PageHeaderProvider({ children }) {
  const [pageHeader, setPageHeaderState] = useState(null);
  const headerIdRef = useRef(0);

  const setPageHeader = useCallback((next) => {
    const id = ++headerIdRef.current;
    setPageHeaderState(next);
    return id;
  }, []);

  const clearPageHeader = useCallback((id) => {
    // Only clear if the id matches the current active header id
    // If no id is provided (legacy), we still clear it to be safe,
    // but components should pass the id they received.
    if (id === undefined || headerIdRef.current === id) {
      setPageHeaderState(null);
    }
  }, []);

  const value = useMemo(
    () => ({ pageHeader, setPageHeader, clearPageHeader }),
    [pageHeader, setPageHeader, clearPageHeader]
  );

  return (
    <PageHeaderContext.Provider value={value}>
      {children}
    </PageHeaderContext.Provider>
  );
}

export function usePageHeader() {
  const ctx = useContext(PageHeaderContext);
  if (!ctx) {
    throw new Error('usePageHeader must be used within PageHeaderProvider');
  }
  return ctx;
}
