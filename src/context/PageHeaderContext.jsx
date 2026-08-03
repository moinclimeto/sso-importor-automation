import { createContext, useCallback, useContext, useMemo, useState } from 'react';

const PageHeaderContext = createContext(null);

export function PageHeaderProvider({ children }) {
  const [pageHeader, setPageHeaderState] = useState(null);

  const setPageHeader = useCallback((next) => {
    setPageHeaderState(next);
  }, []);

  const clearPageHeader = useCallback(() => {
    setPageHeaderState(null);
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
