import {
  HealthLiveResponseSchema,
  HealthReadyResponseSchema,
  type HealthLiveResponse,
  type HealthReadyResponse,
} from "@warrant/contracts";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public data?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!response.ok) {
    let errorData: unknown;
    try {
      errorData = await response.json();
    } catch {
      errorData = await response.text();
    }
    throw new ApiError(response.status, `Request to ${path} failed with status ${response.status}`, errorData);
  }

  return response.json() as Promise<T>;
}

export const api = {
  getHealthLive: async (): Promise<HealthLiveResponse> => {
    const raw = await request<unknown>("/health/live");
    return HealthLiveResponseSchema.parse(raw);
  },

  getHealthReady: async (): Promise<HealthReadyResponse> => {
    const raw = await request<unknown>("/health/ready");
    return HealthReadyResponseSchema.parse(raw);
  },
};
