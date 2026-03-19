import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Token management helper
export const getAuthToken = () => localStorage.getItem("rpm_token");
export const setAuthToken = (token: string) => localStorage.setItem("rpm_token", token);
export const removeAuthToken = () => localStorage.removeItem("rpm_token");

// Helper to patch fetch options with auth token
export const withAuth = (options?: RequestInit): RequestInit => {
  const token = getAuthToken();
  return {
    ...options,
    headers: {
      ...options?.headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  };
};
