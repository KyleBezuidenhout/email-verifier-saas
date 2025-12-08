import { LoginRequest, RegisterRequest, AuthResponse, User, Job, Lead, UploadResponse } from "@/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const token = this.getToken();

    const headers: HeadersInit = {
      "Content-Type": "application/json",
      ...options.headers,
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
      credentials: "include",
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({
        detail: response.statusText,
      }));
      throw new Error(error.detail || "An error occurred");
    }

    return response.json();
  }

  private async requestWithFile<T>(
    endpoint: string,
    file: File,
    additionalData?: Record<string, string | number | boolean>
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const token = this.getToken();

    const formData = new FormData();
    formData.append("file", file);
    
    if (additionalData) {
      Object.entries(additionalData).forEach(([key, value]) => {
        formData.append(key, value);
      });
    }

    const headers: HeadersInit = {};
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: formData,
      credentials: "include",
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({
        detail: response.statusText,
      }));
      throw new Error(error.detail || "An error occurred");
    }

    return response.json();
  }

  private getToken(): string | null {
    if (typeof document === "undefined") return null;
    const cookies = document.cookie.split(";");
    const tokenCookie = cookies.find((c) => c.trim().startsWith("token="));
    return tokenCookie ? tokenCookie.split("=")[1] : null;
  }

  // Auth endpoints
  async login(data: LoginRequest): Promise<AuthResponse> {
    const response = await this.request<AuthResponse>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify(data),
    });
    if (response.access_token) {
      document.cookie = `token=${response.access_token}; path=/; max-age=86400; SameSite=Lax`;
    }
    return response;
  }

  async register(data: RegisterRequest): Promise<AuthResponse> {
    const response = await this.request<AuthResponse>("/api/v1/auth/register", {
      method: "POST",
      body: JSON.stringify(data),
    });
    if (response.access_token) {
      document.cookie = `token=${response.access_token}; path=/; max-age=86400; SameSite=Lax`;
    }
    return response;
  }

  async logout(): Promise<void> {
    await this.request("/api/v1/auth/logout", {
      method: "POST",
    });
    document.cookie = "token=; path=/; max-age=0";
  }

  async getCurrentUser(): Promise<User> {
    return this.request<User>("/api/v1/auth/me");
  }

  // Job endpoints
  async uploadFile(file: File, options?: { company_size?: string }): Promise<UploadResponse> {
    return this.requestWithFile<UploadResponse>("/api/v1/jobs/upload", file, options);
  }

  async getJobs(): Promise<Job[]> {
    return this.request<Job[]>("/api/v1/jobs");
  }

  async getJob(jobId: string): Promise<Job> {
    return this.request<Job>(`/api/v1/jobs/${jobId}`);
  }

  async deleteJob(jobId: string): Promise<void> {
    return this.request<void>(`/api/v1/jobs/${jobId}`, {
      method: "DELETE",
    });
  }

  // Results endpoints
  async getResults(jobId: string): Promise<Lead[]> {
    return this.request<Lead[]>(`/api/v1/results/${jobId}`);
  }
}

export const apiClient = new ApiClient(API_URL);

