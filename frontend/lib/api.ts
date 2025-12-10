import { LoginRequest, RegisterRequest, AuthResponse, User, Job, Lead, UploadResponse } from "@/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.billionverifier.io";

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

      // Handle 401 Unauthorized - token expired or invalid
      if (response.status === 401) {
        // Clear invalid token
        document.cookie = "token=; path=/; max-age=0";
        // Clear token from all paths
        if (typeof window !== "undefined") {
          document.cookie = "token=; path=/; max-age=0; domain=" + window.location.hostname;
          // Only redirect to login if we're not already on public pages (home, login, register)
          const currentPath = window.location.pathname;
          if (currentPath !== "/" && currentPath !== "/login" && currentPath !== "/register") {
            window.location.href = "/login";
          }
        }
        throw new Error("Session expired. Please log in again.");
      }

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

    // Handle 401 Unauthorized - token expired or invalid
    if (response.status === 401) {
      // Clear invalid token
      document.cookie = "token=; path=/; max-age=0";
      if (typeof window !== "undefined") {
        document.cookie = "token=; path=/; max-age=0; domain=" + window.location.hostname;
        // Only redirect to login if we're not already on public pages (home, login, register)
        const currentPath = window.location.pathname;
        if (currentPath !== "/" && currentPath !== "/login" && currentPath !== "/register") {
          window.location.href = "/login";
        }
      }
      throw new Error("Session expired. Please log in again.");
    }

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
    if (!tokenCookie) return null;
    // Fix: Split only on first '=' to handle JWT tokens that contain '='
    const parts = tokenCookie.trim().split("=");
    if (parts.length < 2) return null;
    return parts.slice(1).join("="); // Rejoin in case token contains '='
  }

  // Auth endpoints
  async login(data: LoginRequest): Promise<AuthResponse> {
    const response = await this.request<AuthResponse>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify(data),
    });
    if (response.access_token) {
      // If rememberMe is true, set cookie for 10 days (864000 seconds), otherwise 7 days (604800 seconds)
      const maxAge = data.rememberMe ? 864000 : 604800;
      document.cookie = `token=${response.access_token}; path=/; max-age=${maxAge}; SameSite=Lax`;
    }
    return response;
  }

  async register(data: RegisterRequest): Promise<AuthResponse> {
    const response = await this.request<AuthResponse>("/api/v1/auth/register", {
      method: "POST",
      body: JSON.stringify(data),
    });
    if (response.access_token) {
      // Set cookie for 7 days (604800 seconds) - same as login without rememberMe
      document.cookie = `token=${response.access_token}; path=/; max-age=604800; SameSite=Lax`;
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

  async regenerateApiKey(): Promise<User> {
    return this.request<User>("/api/v1/auth/regenerate-api-key", {
      method: "POST",
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

  async uploadVerifyFile(
    file: File,
    options?: {
      column_email?: string;
      column_first_name?: string;
      column_last_name?: string;
    }
  ): Promise<UploadResponse> {
    return this.requestWithFile<UploadResponse>("/api/v1/jobs/verify-upload", file, options);
  }

  async getJobs(jobType?: 'enrichment' | 'verification'): Promise<Job[]> {
    const url = jobType ? `/api/v1/jobs?job_type=${jobType}` : "/api/v1/jobs";
    return this.request<Job[]>(url);
  }

  async getJob(jobId: string): Promise<Job> {
    return this.request<Job>(`/api/v1/jobs/${jobId}`);
  }

  async deleteJob(jobId: string): Promise<void> {
    return this.request<void>(`/api/v1/jobs/${jobId}`, {
      method: "DELETE",
    });
  }

  async cancelJob(jobId: string): Promise<{ message: string; job_id: string }> {
    return this.request<{ message: string; job_id: string }>(`/api/v1/jobs/${jobId}/cancel`, {
      method: "POST",
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

  // ============================================
  // ADMIN ENDPOINTS
  // ============================================

  async getAdminClients(limit = 100, offset = 0): Promise<{
    clients: Array<{
      id: string;
      email: string;
      full_name: string | null;
      company_name: string | null;
      credits: number;
      is_active: boolean;
      is_admin: boolean;
      created_at: string;
      stats: {
        total_jobs: number;
        enrichment_jobs: number;
        verification_jobs: number;
        total_valid_emails: number;
        total_catchall_emails: number;
        total_leads_processed: number;
      };
    }>;
    total: number;
  }> {
    return this.request(`/api/v1/admin/clients?limit=${limit}&offset=${offset}`);
  }

  async getAdminLowCreditClients(threshold = 10): Promise<{
    clients: Array<{
      id: string;
      email: string;
      full_name: string | null;
      company_name: string | null;
      credits: number;
      created_at: string;
    }>;
    count: number;
  }> {
    return this.request(`/api/v1/admin/clients/low-credits?threshold=${threshold}`);
  }

  async getAdminClientDetail(clientId: string): Promise<{
    client: {
      id: string;
      email: string;
      full_name: string | null;
      company_name: string | null;
      credits: number;
      is_active: boolean;
      is_admin: boolean;
      api_key: string;
      created_at: string;
    };
    stats: {
      total_jobs: number;
      total_valid_emails: number;
      total_catchall_emails: number;
      total_leads_processed: number;
      total_credits_used: number;
    };
    recent_jobs: Array<{
      id: string;
      status: string;
      job_type: string;
      total_leads: number;
      processed_leads: number;
      valid_emails_found: number;
      catchall_emails_found: number;
      created_at: string;
    }>;
  }> {
    return this.request(`/api/v1/admin/clients/${clientId}`);
  }

  async updateAdminClientCredits(clientId: string, credits: number): Promise<{
    client_id: string;
    old_credits: number;
    new_credits: number;
    message: string;
  }> {
    return this.request(`/api/v1/admin/clients/${clientId}/credits?credits=${credits}`, {
      method: "PUT",
    });
  }

  async getAdminJobs(limit = 100, offset = 0, status?: string, jobType?: string): Promise<{
    jobs: Array<{
      id: string;
      status: string;
      job_type: string;
      original_filename: string | null;
      total_leads: number;
      processed_leads: number;
      valid_emails_found: number;
      catchall_emails_found: number;
      cost_in_credits: number;
      created_at: string;
      completed_at: string | null;
      client: {
        id: string;
        email: string;
        full_name: string | null;
        company_name: string | null;
      };
    }>;
    total: number;
  }> {
    let url = `/api/v1/admin/jobs?limit=${limit}&offset=${offset}`;
    if (status) url += `&status_filter=${status}`;
    if (jobType) url += `&job_type=${jobType}`;
    return this.request(url);
  }

  async getAdminStats(): Promise<{
    clients: { total: number; active: number };
    jobs: { total: number; by_status: Record<string, number>; today: number };
    leads: { total_processed: number; total_valid: number; total_catchall: number; today: number };
  }> {
    return this.request("/api/v1/admin/stats");
  }

  async getAdminEnrichmentStats(period = "week", startDate?: string, endDate?: string): Promise<{
    period: string;
    start_date: string;
    end_date: string;
    chart_data: Array<{
      date: string;
      leads_enriched: number;
      valid_found: number;
      catchall_found: number;
      jobs_count: number;
    }>;
    totals: {
      total_leads: number;
      total_valid: number;
      total_catchall: number;
      total_jobs: number;
    };
  }> {
    let url = `/api/v1/admin/stats/enrichments?period=${period}`;
    if (startDate) url += `&start_date=${startDate}`;
    if (endDate) url += `&end_date=${endDate}`;
    return this.request(url);
  }

  async getAdminApiKeyUsage(): Promise<{
    mailtester_keys: Array<{
      key_id: string;
      key_preview: string;
      usage_today: number;
      remaining: number;
      limit: number;
      usage_percentage: number;
      resets_at: string;
      date: string;
    }>;
    omniverifier: { available: number; provider: string } | { error: string } | null;
    total_mailtester_keys: number;
    total_remaining: number;
  }> {
    return this.request("/api/v1/admin/api-keys/usage");
  }

  async getAdminErrors(date?: string, limit = 100, offset = 0): Promise<{
    errors: Array<{
      timestamp: string;
      user_id: string;
      user_email: string;
      job_id: string;
      error_type: string;
      error_message: string;
      email_attempted: string | null;
    }>;
    summary: {
      date: string;
      total_errors: number;
      by_user: Record<string, number>;
      by_job: Record<string, number>;
      by_type: Record<string, number>;
    };
    total: number;
  }> {
    let url = `/api/v1/admin/errors?limit=${limit}&offset=${offset}`;
    if (date) url += `&date=${date}`;
    return this.request(url);
  }
}

export const apiClient = new ApiClient(API_URL);

