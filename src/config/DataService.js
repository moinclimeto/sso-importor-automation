import axios from 'axios';
import { Api, getApiBaseUrl } from './apiEndpoints.js';

const DataService = axios.create({
  baseURL: `${getApiBaseUrl()}/`,
  timeout: 20000,
});

const PUBLIC_ROUTES = [Api.LOGIN];

DataService.interceptors.request.use(
  (config) => {
    const isPublic = PUBLIC_ROUTES.some((route) => config.url?.includes(route));
    if (!isPublic) {
      const token = localStorage.getItem('token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error),
);

export default DataService;
