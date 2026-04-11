import axios from "axios";

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");

export const apiClient = axios.create({
  baseURL: `${BASE_URL}/api`,
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("scheduler_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("scheduler_token");
      window.location.href = `${BASE_URL}/login`;
    }
    return Promise.reject(err);
  }
);

export default apiClient;
