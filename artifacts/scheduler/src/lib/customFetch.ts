export async function schedulerFetch<T = unknown>(
  input: RequestInfo | URL,
  options: RequestInit & { responseType?: string; skipAuthRedirect?: boolean } = {}
): Promise<T> {
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }
  headers.set("X-Requested-With", "XMLHttpRequest");

  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: "include",
  });

  if (response.status === 401) {
    if (!options.skipAuthRedirect) {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      window.location.href = `${base}/login`;
    }
    throw new Error("Unauthorized");
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({})) as { message?: string };
    throw Object.assign(new Error(errorData.message || `HTTP ${response.status}`), { status: response.status, data: errorData });
  }

  if (response.status === 204) return null as T;

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("text/csv") || options.responseType === "text") {
    return response.text() as unknown as T;
  }
  const contentLength = response.headers.get("content-length");
  if (contentLength === "0") return null as T;
  return response.json() as T;
}
