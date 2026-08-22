export const Api = {
  LOGIN: 'auth/login',
};

export function getApiBaseUrl() {
  const fromEnv = String(import.meta.env.VITE_API_BASE_URL || '').trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, '');
  return 'https://api.climeto.in/api';
}
