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

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({
          detail: response.statusText,
        }));
        throw new Error(error.detail || "An error occurred");
      }

      // Handle 204 No Content (DELETE endpoints return no body)
      if (response.status === 204) {
        return undefined as T;
      }

      // Handle empty responses
      const text = await response.text();
      if (!text) {
        return undefined as T;
      }

      return JSON.parse(text);
    } catch (error) {
      // Handle network errors (Failed to fetch, CORS, etc.)
      if (error instanceof TypeError && error.message === "Failed to fetch") {
        throw new Error(
          `Unable to connect to backend. Please check that the API is running at ${this.baseUrl}`
        );
      }
      // Re-throw other errors
      throw error;
    }
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
        formData.append(key, String(value));
      });
    }

    const headers: Record<string, string> = {};
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: formData,
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

  async updateUser(data: { catchall_verifier_api_key?: string }): Promise<User> {
    return this.request<User>("/api/v1/auth/me", {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  // Job endpoints
  async uploadFile(
    file: File,
    options?: {
      company_size?: string;
      column_first_name?: string;
      column_last_name?: string;
      column_website?: string;
      column_company_size?: string;
    }
  ): Promise<UploadResponse> {
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

  async verifyCatchalls(jobId: string): Promise<{ verified_count: number; message: string; total_catchalls: number; errors?: string[] }> {
    return this.request(`/api/v1/jobs/${jobId}/verify-catchalls`, {
      method: "POST",
    });
  }

  // Test email endpoint (public, no auth required)
  async testEmail(name: string, companyWebsite: string): Promise<{ name: string; company: string; email: string; status: string }> {
    const url = `${this.baseUrl}/api/v1/test-email`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name, company_website: companyWebsite }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({
        detail: response.statusText,
      }));
      throw new Error(error.detail || "An error occurred");
    }

    return response.json();
  }
}

export const apiClient = new ApiClient(API_URL);

