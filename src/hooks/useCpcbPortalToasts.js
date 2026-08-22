import { useCallback, useEffect, useState } from 'react';

export function useCpcbPortalToasts(showToast) {
  const [portalToasts, setPortalToasts] = useState([]);

  useEffect(() => {
    const api = window.pwp?.scraper?.onPortalToast;
    if (!api) return undefined;
    return api((payload) => {
      const text = String(payload?.text || '').trim();
      if (!text) return;
      const type = payload?.type || 'info';
      const item = {
        id: `${payload?.t || Date.now()}-${text}`,
        text,
        type,
        t: payload?.t || Date.now(),
      };
      setPortalToasts((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.text === text && last.type === type && item.t - last.t < 1500) {
          return prev;
        }
        return [...prev.slice(-49), item];
      });
      if (typeof showToast === 'function') {
        showToast(text, type, { duration: type === 'error' || type === 'warning' ? 8000 : 4000 });
      }
    });
  }, [showToast]);

  const clearPortalToasts = useCallback(() => setPortalToasts([]), []);

  return { portalToasts, clearPortalToasts };
}
