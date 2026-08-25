export class AppError extends Error {
  code: string;
  details?: Record<string, unknown>[];

  constructor(code: string, message: string, details?: Record<string, unknown>[]) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.details = details;
  }
}

const API_BASE_URL = "http://localhost:4000/api/v1";

interface RequestOptions {
  /** Bearer token to attach; the session store (Task 13) passes the current one in explicitly — apiClient holds no auth state itself. */
  token?: string;
}

async function request<T>(method: string, path: string, body?: unknown, opts?: RequestOptions): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts?.token) headers.Authorization = `Bearer ${opts.token}`;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const json = await response.json();
  if (!response.ok) {
    const { code, message, details } = json.error;
    throw new AppError(code, message, details);
  }
  return json.data as T;
}

export const apiClient = {
  get: <T>(path: string, opts?: RequestOptions) => request<T>("GET", path, undefined, opts),
  post: <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>("POST", path, body, opts),
  patch: <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>("PATCH", path, body, opts),
  delete: <T>(path: string, opts?: RequestOptions) => request<T>("DELETE", path, undefined, opts)
};
