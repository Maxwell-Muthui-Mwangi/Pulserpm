import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Always refetch on window focus so re-opening a tab shows current data.
      refetchOnWindowFocus: true,
      // staleTime: 0 means every refetchInterval fires an actual network request
      // instead of serving from cache. Critical for a medical monitoring dashboard.
      staleTime: 0,
      retry: (failureCount, error: unknown) => {
        const status = (error as { status?: number })?.status;
        if (status === 401 || status === 403) return false;
        if (failureCount >= 1) return false;
        return true;
      },
    },
  },
});
