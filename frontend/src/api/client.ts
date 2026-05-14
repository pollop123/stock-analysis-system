import axios from "axios";
import type { TokenPair } from "@/types";

const API_PREFIX = normalizePath(import.meta.env.VITE_API_PREFIX || "/api/v1");
const API_BASE_URL = resolveApiBaseUrl();

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function normalizePath(value: string) {
  const path = `/${value}`.replace(/\/+/g, "/");
  return trimTrailingSlash(path);
}

function resolveApiBaseUrl() {
  const apiUrl = trimTrailingSlash(import.meta.env.VITE_API_URL || "");
  let base = "";
  if (apiUrl) {
    base = apiUrl.endsWith(API_PREFIX) ? apiUrl : `${apiUrl}${API_PREFIX}`;
  } else {
    const apiOrigin = trimTrailingSlash(import.meta.env.VITE_API_ORIGIN || "");
    base = `${apiOrigin}${API_PREFIX}`;
  }
  return base.endsWith("/") ? base : `${base}/`;
}

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

let isRefreshing = false;
let refreshSubscribers: ((token: string) => void)[] = [];

function onRefreshed(token: string) {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
}

function addRefreshSubscriber(cb: (token: string) => void) {
  refreshSubscribers.push(cb);
}

function getAccessToken(): string | null {
  return localStorage.getItem("access_token");
}

function getRefreshToken(): string | null {
  return localStorage.getItem("refresh_token");
}

function setTokens(pair: TokenPair) {
  localStorage.setItem("access_token", pair.access_token);
  localStorage.setItem("refresh_token", pair.refresh_token);
}

function clearTokens() {
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
}

apiClient.interceptors.request.use(
  (config) => {
    const token = getAccessToken();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true;

      const refreshToken = getRefreshToken();
      if (!refreshToken) {
        clearTokens();
        window.location.href = "/login";
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise((resolve) => {
          addRefreshSubscriber((token: string) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            resolve(apiClient(originalRequest));
          });
        });
      }

      isRefreshing = true;

      try {
        const res = await axios.post<TokenPair>(`${API_BASE_URL}token-refreshes`, {
          refresh_token: refreshToken,
        });
        setTokens(res.data);
        onRefreshed(res.data.access_token);
        originalRequest.headers.Authorization = `Bearer ${res.data.access_token}`;
        return apiClient(originalRequest);
      } catch (refreshError) {
        clearTokens();
        window.location.href = "/login";
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export { getAccessToken, getRefreshToken, setTokens, clearTokens };
