import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Always refetch on window focus so re-opening a tab shows current data.
      refetchOnWindowFocus: true,
      // staleTime: 0 means every refetchInterval fires an actual network request
      // instead of serving from cache. Critical for a medical monitoring dashboard.
      staleTime: 0,
      // Keep polling even when the browser tab is not in focus — e.g. provider
      // has the dashboard open in a background tab while reviewing another window.
      refetchIntervalInBackground: true,
      retry: (failureCount, error: unknown) => {
        const status = (error as { status?: number })?.status;
        if (status === 401 || status === 403) return false;
        if (failureCount >= 1) return false;
        return true;
      },
    },
  },
});
