import { 
  LoginRequest, 
  RegisterRequest, 
  AuthResponse, 
  RegisterPendingResponse,
  User, 
  Job, 
  Lead, 
  UploadResponse,
  VayneAuthStatus,
  VayneCredits,
  VayneDailyUsage,
  VayneUrlCheck,
  VayneOrder,
  VayneOrderCreate,
  GoogleMapsScraperOrder,
  GoogleMapsScraperOrderCreate,
  GoogleMapsScraperHealthStatus,
  GoogleMapsScraperCostEstimate,
  GoogleMapsScraperPreviewResponse,
  WebsiteScraperJob,
  WebsiteScraperHealthStatus,
  WebsiteScraperUploadResponse,
  WebsiteScraperPreviewResponse,
  EnrichRequest,
  EnrichResponse,
  AnalyticsResponse,
  OAuthAuthorizeResponse,
  ForgotPasswordResponse,
} from "@/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.billionverifier.io";

// Flag to prevent multiple redirects
let isRedirectingToLogin = false;

export class ApiError extends Error {
  status: number;
  detail: string;
  body: Record<string, unknown>;

  constructor(status: number, body: Record<string, unknown>) {
    const detail = (body.detail as string) || "An error occurred";
    super(detail);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
    this.body = body;
  }
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    timeoutMs: number = 30_000
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const token = this.getToken();

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });

      // Handle 401 Unauthorized - token expired or invalid
      if (response.status === 401) {
        // Clear invalid token
        document.cookie = "token=; path=/; max-age=0";
        
        if (typeof window !== "undefined") {
          document.cookie = "token=; path=/; max-age=0; domain=" + window.location.hostname;
          
          // Only redirect to login once (prevents multiple redirects from parallel requests)
          const currentPath = window.location.pathname;
          if (currentPath !== "/" && currentPath !== "/login" && currentPath !== "/register" && currentPath !== "/check-email" && currentPath !== "/verify-email" && currentPath !== "/forgot-password" && currentPath !== "/reset-password" && !currentPath.startsWith("/auth/callback") && currentPath !== "/onboarding" && !isRedirectingToLogin) {
            isRedirectingToLogin = true;
            // Small delay to allow any pending requests to complete
            setTimeout(() => {
              window.location.href = "/login";
            }, 100);
          }
        }
        
        // Throw an Error with silent flag for proper error handling
        const error = new Error("Session expired");
        (error as Error & { silent?: boolean }).silent = true;
        throw error;
      }

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({
          detail: response.statusText,
        }));
        throw new ApiError(response.status, errorBody);
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
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new Error(
          "Request timed out. The server may be slow or unavailable — please try again."
        );
      }
      if (error instanceof TypeError && error.message === "Failed to fetch") {
        throw new Error(
          `Unable to connect to backend. Please check that the API is running at ${this.baseUrl}`
        );
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  private async requestWithFile<T>(
    endpoint: string,
    file: File,
    additionalData?: Record<string, string | number | boolean>,
    timeoutMs: number = 120_000
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const token = this.getToken();

    const formData = new FormData();
    formData.append("file", file);

    if (additionalData) {
      Object.entries(additionalData).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          formData.append(key, String(value));
        }
      });
    }

    const headers: Record<string, string> = {};
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      console.log(`[upload] POST ${endpoint} file=${file.name} size=${file.size}`);
      response = await fetch(url, {
        method: "POST",
        headers,
        body: formData,
        signal: controller.signal,
      });
      console.log(`[upload] response status=${response.status}`);
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new Error(
          `Upload timed out after ${timeoutMs / 1000}s. The server may be overloaded — please try again.`
        );
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 401) {
      document.cookie = "token=; path=/; max-age=0";
      if (typeof window !== "undefined") {
        document.cookie = "token=; path=/; max-age=0; domain=" + window.location.hostname;
        const currentPath = window.location.pathname;
        if (currentPath !== "/" && currentPath !== "/login" && currentPath !== "/register" && currentPath !== "/check-email" && currentPath !== "/verify-email" && currentPath !== "/forgot-password" && currentPath !== "/reset-password") {
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
    let response: AuthResponse;
    try {
      response = await this.request<AuthResponse>("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify(data),
      });
    } catch (err) {
      if (err instanceof Error && err.message === "Session expired") {
        throw new Error("Incorrect email or password");
      }
      throw err;
    }
    if (response.access_token) {
      // If rememberMe is true, set cookie for 10 days (864000 seconds), otherwise 7 days (604800 seconds)
      const maxAge = data.rememberMe ? 864000 : 604800;
      document.cookie = `token=${response.access_token}; path=/; max-age=${maxAge}; SameSite=Lax`;
    }
    return response;
  }

  async register(data: RegisterRequest): Promise<RegisterPendingResponse> {
    return this.request<RegisterPendingResponse>("/api/v1/auth/register", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async verifyEmail(token: string): Promise<AuthResponse> {
    const response = await this.request<AuthResponse>("/api/v1/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token }),
    });
    if (response.access_token) {
      document.cookie = `token=${response.access_token}; path=/; max-age=604800; SameSite=Lax`;
    }
    return response;
  }

  async resendVerification(email: string): Promise<{ message: string }> {
    return this.request<{ message: string }>("/api/v1/auth/resend-verification", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  }

  async resetPassword(token: string, new_password: string): Promise<{ message: string }> {
    return this.request<{ message: string }>("/api/v1/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, new_password }),
    });
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

  async updateUser(data: { catchall_verifier_api_key?: string; email_notifications_enabled?: boolean; company_website?: string; referral_source?: string }): Promise<User> {
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

  // OAuth endpoints
  async getOAuthUrl(provider: "google" | "microsoft"): Promise<OAuthAuthorizeResponse> {
    return this.request<OAuthAuthorizeResponse>(`/api/v1/auth/oauth/${provider}/authorize`);
  }

  async oauthCallback(provider: string, code: string, state: string): Promise<AuthResponse> {
    const response = await this.request<AuthResponse>(`/api/v1/auth/oauth/${provider}/callback`, {
      method: "POST",
      body: JSON.stringify({ code, state }),
    });
    if (response.access_token) {
      document.cookie = `token=${response.access_token}; path=/; max-age=864000; SameSite=Lax`;
    }
    return response;
  }

  async forgotPassword(email: string): Promise<ForgotPasswordResponse> {
    return this.request<ForgotPasswordResponse>("/api/v1/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  }

  // Job endpoints
  async uploadFile(
    file: File,
    options?: {
      column_first_name?: string;
      column_last_name?: string;
      column_website?: string;
      source?: string; // e.g., "Sales Nav"
      job_name?: string; // Optional user-provided job name
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
      job_name?: string; // Optional user-provided job name
    }
  ): Promise<UploadResponse> {
    return this.requestWithFile<UploadResponse>("/api/v1/jobs/verify-upload", file, options);
  }

  async uploadCatchallFile(
    file: File,
    options?: {
      column_email?: string;
      job_name?: string;
    }
  ): Promise<UploadResponse> {
    return this.requestWithFile<UploadResponse>("/api/v1/jobs/catchall-upload", file, options);
  }

  async getJobs(jobType?: 'enrichment' | 'verification' | 'catchall_verification'): Promise<Job[]> {
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
      max_concurrent_jobs: number;
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
      file_url: string | null;
      failure_reason: string | null;
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

  async adminDeleteJob(jobId: string): Promise<{
    message: string;
    deleted_job: {
      id: string;
      user_id: string;
      status: string;
      job_type: string;
      total_leads: number;
    };
  }> {
    return this.request(`/api/v1/admin/jobs/${jobId}`, {
      method: "DELETE",
    });
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
    omniverifier: { balance: number; last_credits_deducted: number | null; updated_at: string | null } | { error: string } | null;
    total_mailtester_keys: number;
    total_remaining: number;
  }> {
    return this.request("/api/v1/admin/api-keys/usage");
  }

  async getAdminVayneStats(): Promise<{
    keys: Array<{
      key_index: number;
      key_preview: string;
      credit_available: number;
      daily_limit_leads: number;
      error: string | null;
    }>;
    total_credit_available: number;
    total_daily_limit_leads: number;
  }> {
    return this.request("/api/v1/admin/api-keys/vayne-stats");
  }

  async getAdminFairshareStatus(): Promise<{
    active_job_count: number;
    queued_job_count: number;
    waiting_room_count: number;
    total_keys: number | null;
    active_jobs: Array<{
      job_id: string;
      user_id: string;
      user_email: string;
      job_type: string;
      total_leads: number;
      processed_leads: number;
      keys_allocated: number | null;
      throughput: {
        rate_per_hour: number;
        items_processed: number;
        window_seconds: number;
        timestamp: string;
      } | null;
    }>;
    queued_jobs: Array<{
      job_id: string;
      user_id: string;
      user_email: string;
      job_type: string;
      total_leads: number;
    }>;
    waiting_room_jobs: Array<{
      job_id: string;
      user_id: string;
      user_email: string;
      job_type: string;
      total_leads: number;
    }>;
  }> {
    return this.request("/api/v1/admin/fairshare/status");
  }

  async impersonateClient(clientId: string): Promise<{
    access_token: string;
    token_type: string;
    user: { id: string; email: string; full_name: string | null; company_name: string | null };
  }> {
    return this.request(`/api/v1/admin/impersonate/${clientId}`, { method: "POST" });
  }

  async updateClientMaxJobs(clientId: string, maxJobs: number): Promise<{
    client_id: string;
    max_concurrent_jobs: number;
    previous_max: number;
    promoted_from_waiting_room: number;
  }> {
    return this.request(`/api/v1/admin/clients/${clientId}/max-jobs?max_jobs=${maxJobs}`, {
      method: "PUT",
    });
  }

  async updateClientPlan(clientId: string, plan: string): Promise<{
    client_id: string;
    old_plan: string;
    new_plan: string;
  }> {
    return this.request(`/api/v1/admin/clients/${clientId}/plan?plan=${encodeURIComponent(plan)}`, {
      method: "PUT",
    });
  }

  async updateClientCustomCreditPrice(clientId: string, price: number): Promise<{
    client_id: string;
    custom_credit_price: number;
    plan: string;
  }> {
    return this.request(`/api/v1/admin/clients/${clientId}/custom-credit-price?price=${price}`, {
      method: "PUT",
    });
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

  // ============================================
  // ANALYTICS DASHBOARD
  // ============================================

  async getAdminAnalytics(startDate: string, endDate: string, clientId?: string): Promise<AnalyticsResponse> {
    const params = new URLSearchParams({ start_date: startDate, end_date: endDate });
    if (clientId && clientId !== "all") params.set("client_id", clientId);
    return this.request(`/api/v1/admin/analytics?${params}`);
  }

  // ============================================
  // VAYNE API ENDPOINTS (Sales Nav Scraper)
  // ============================================

  async getVayneAuthStatus(): Promise<VayneAuthStatus> {
    return this.request("/api/v1/vayne/auth");
  }

  async updateVayneAuth(session_cookie: string): Promise<{ authenticated: boolean; session_valid: boolean; message?: string }> {
    return this.request("/api/v1/vayne/auth", {
      method: "PATCH",
      body: JSON.stringify({ session_cookie }),
    });
  }

  async getVayneCredits(): Promise<VayneCredits> {
    return this.request("/api/v1/vayne/credits");
  }

  async getVayneDailyUsage(): Promise<VayneDailyUsage> {
    return this.request("/api/v1/vayne/daily-usage");
  }

  async resetVayneDailyUsage(): Promise<{ success: boolean; message: string }> {
    return this.request("/api/v1/vayne/daily-usage/reset", { method: "POST" });
  }

  async resetVayneDailyUsageWithToken(token: string): Promise<{ success: boolean; message: string }> {
    return this.request("/api/v1/vayne/daily-usage/reset-with-token", {
      method: "POST",
      body: JSON.stringify({ token }),
    });
  }

  async checkVayneUrl(sales_nav_url: string): Promise<VayneUrlCheck> {
    return this.request("/api/v1/vayne/url-check", {
      method: "POST",
      body: JSON.stringify({ sales_nav_url }),
    });
  }

  async createVayneOrder(order: VayneOrderCreate): Promise<{ success: boolean; order_id: string; status: string; message: string }> {
    return this.request("/api/vayne/orders", {
      method: "POST",
      body: JSON.stringify(order),
    });
  }

  async getVayneOrder(orderId: string): Promise<VayneOrder> {
    return this.request(`/api/v1/vayne/orders/${orderId}`);
  }

  /**
   * Poll Vayne API for live order status (UI-only update, does NOT update database).
   * Use this for displaying real-time scraping progress in the UI.
   */
  async pollVayneOrderStatus(orderId: string): Promise<{
    order_id: string;
    vayne_order_id: string | null;
    status: string;
    scraping_status: string | null;
    leads_found: number;
    leads_qualified: number;
    progress_percentage: number;
    from_database: boolean;
    error?: string;
  }> {
    return this.request(`/api/v1/vayne/orders/${orderId}/poll-status`);
  }

  async exportVayneOrder(orderId: string): Promise<{ status: string; message: string; csv_file_path?: string }> {
    // This endpoint stores CSV in R2, doesn't return the file
    return this.request<{ status: string; message: string; csv_file_path?: string }>(`/api/vayne/orders/${orderId}/export`, {
      method: "POST",
    });
  }

  async downloadVayneOrderCSV(orderId: string): Promise<Blob> {
    // This endpoint downloads CSV from R2 (GET /api/vayne/orders/:id/download)
    const url = `${this.baseUrl}/api/vayne/orders/${orderId}/download`;
    const token = this.getToken();
    
    console.log(`[API] Downloading CSV for order ${orderId}`);
    console.log(`[API] URL: ${url}`);
    console.log(`[API] Has token: ${!!token}`);
    
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    console.log(`[API] Response status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const error = await response.json().catch(() => ({
        detail: response.statusText,
      }));
      console.error(`[API] Download failed:`, error);
      throw new Error(error.detail || "Failed to export order. The order may still be processing.");
    }

    return response.blob();
  }

  async getVayneOrderHistory(limit = 10, offset = 0, status?: string): Promise<{
    orders: VayneOrder[];
    total: number;
  }> {
    let url = `/api/v1/vayne/orders?limit=${limit}&offset=${offset}`;
    if (status) url += `&status=${status}`;
    return this.request(url);
  }

  async deleteVayneOrder(orderId: string): Promise<{ message: string; order_id: string }> {
    return this.request<{ message: string; order_id: string }>(`/api/v1/vayne/orders/${orderId}`, {
      method: "DELETE",
    });
  }

  async cancelVayneOrder(orderId: string): Promise<{ message: string; order_id: string; previous_status: string }> {
    return this.request<{ message: string; order_id: string; previous_status: string }>(`/api/v1/vayne/orders/${orderId}/cancel`, {
      method: "POST",
    });
  }

  // ============================================
  // PAYMENT ENDPOINTS (Stripe)
  // ============================================

  async createCheckoutSession(amountDollars: number): Promise<{ checkout_url: string; session_id: string }> {
    return this.request("/api/v1/payments/create-checkout", {
      method: "POST",
      body: JSON.stringify({ amount_dollars: amountDollars }),
    });
  }

  async verifyCheckoutSession(sessionId: string): Promise<{
    payment_status: string;
    amount_dollars: number;
    credits_purchased: number;
    current_credits: number;
  }> {
    return this.request(`/api/v1/payments/verify-session/${sessionId}`);
  }

  async downloadVayneOrderCSVFile(orderId: string): Promise<void> {
    const url = `${this.baseUrl}/api/v1/vayne/orders/${orderId}/download`;
    const token = this.getToken();
    
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({
        detail: response.statusText,
      }));
      throw new Error(error.detail || "Failed to download CSV");
    }

    // Get filename from Content-Disposition header or use default
    const contentDisposition = response.headers.get("Content-Disposition");
    let filename = "export.csv";
    if (contentDisposition) {
      const match = contentDisposition.match(/filename="?([^"]+)"?/);
      if (match) {
        filename = match[1];
      }
    }

    // Download the blob
    const blob = await response.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(downloadUrl);
  }

  // ============================================
  // GOOGLE MAPS SCRAPER ENDPOINTS (via Apify compass/crawler-google-places)
  // ============================================

  async getGoogleMapsScraperHealth(): Promise<GoogleMapsScraperHealthStatus> {
    return this.request("/api/v1/local-scraper/health");
  }

  async getGoogleMapsScraperStates(): Promise<{ states: string[] }> {
    return this.request("/api/v1/local-scraper/states");
  }

  async getGoogleMapsScraperCities(state: string): Promise<{ state: string; cities: string[]; count: number }> {
    return this.request(`/api/v1/local-scraper/cities/${encodeURIComponent(state)}`);
  }

  async estimateGoogleMapsScraperCost(scrape_mode: string, states: string[], city?: string): Promise<GoogleMapsScraperCostEstimate> {
    return this.request("/api/v1/local-scraper/estimate", {
      method: "POST",
      body: JSON.stringify({ scrape_mode, states, city }),
    });
  }

  async createGoogleMapsScraperOrder(order: GoogleMapsScraperOrderCreate): Promise<GoogleMapsScraperOrder> {
    return this.request("/api/v1/local-scraper/orders", {
      method: "POST",
      body: JSON.stringify(order),
    });
  }

  async getGoogleMapsScraperOrders(limit = 100, offset = 0, status?: string): Promise<{
    orders: GoogleMapsScraperOrder[];
    total: number;
  }> {
    let url = `/api/v1/local-scraper/orders?limit=${limit}&offset=${offset}`;
    if (status) url += `&status=${status}`;
    return this.request(url);
  }

  async getGoogleMapsScraperOrder(orderId: string): Promise<GoogleMapsScraperOrder> {
    return this.request(`/api/v1/local-scraper/orders/${orderId}`);
  }

  async pollGoogleMapsScraperOrderStatus(orderId: string): Promise<{
    order_id: string;
    status: string;
    total_cities: number;
    completed_cities: number;
    progress_percentage: number;
    results_count: number;
    error_message?: string | null;
  }> {
    return this.request(`/api/v1/local-scraper/orders/${orderId}/status`);
  }

  async deleteGoogleMapsScraperOrder(orderId: string): Promise<{ message: string; order_id: string }> {
    return this.request(`/api/v1/local-scraper/orders/${orderId}`, {
      method: "DELETE",
    });
  }

  async downloadGoogleMapsScraperResults(orderId: string): Promise<void> {
    const url = `${this.baseUrl}/api/v1/local-scraper/orders/${orderId}/download`;
    const token = this.getToken();
    
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({
        detail: response.statusText,
      }));
      throw new Error(error.detail || "Failed to download results");
    }

    // Get filename from Content-Disposition header or use default
    const contentDisposition = response.headers.get("Content-Disposition");
    let filename = "google_maps_results.csv";
    if (contentDisposition) {
      const match = contentDisposition.match(/filename="?([^"]+)"?/);
      if (match) {
        filename = match[1];
      }
    }

    // Download the blob
    const blob = await response.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(downloadUrl);
  }

  async getGoogleMapsScraperPreview(orderId: string, limit = 25): Promise<GoogleMapsScraperPreviewResponse> {
    return this.request(`/api/v1/local-scraper/orders/${orderId}/preview?limit=${limit}`);
  }

  // ============================================
  // WEBSITE CONTACT SCRAPER ENDPOINTS (Crawl4AI for email/phone extraction)
  // ============================================

  async getWebsiteScraperHealth(): Promise<WebsiteScraperHealthStatus> {
    return this.request("/api/v1/website-scraper/health");
  }

  async uploadWebsiteScraperFile(file: File, options?: { 
    column_website?: string; 
    job_name?: string;
    enable_cache?: boolean;
    enable_sublink_scraping?: boolean;
  }): Promise<WebsiteScraperUploadResponse> {
    return this.requestWithFile<WebsiteScraperUploadResponse>("/api/v1/website-scraper/upload", file, options);
  }

  async getWebsiteScraperJobs(limit = 100, offset = 0, status?: string): Promise<{
    jobs: WebsiteScraperJob[];
    total: number;
  }> {
    let url = `/api/v1/website-scraper/jobs?limit=${limit}&offset=${offset}`;
    if (status) url += `&status=${status}`;
    return this.request(url);
  }

  async getWebsiteScraperJob(jobId: string): Promise<WebsiteScraperJob> {
    return this.request(`/api/v1/website-scraper/jobs/${jobId}`);
  }

  async pollWebsiteScraperJobStatus(jobId: string): Promise<{
    job_id: string;
    status: string;
    total_leads: number;
    completed_leads: number;
    progress_percentage: number;
    hit_rate_percentage: number;
    error_message?: string;
  }> {
    return this.request(`/api/v1/website-scraper/jobs/${jobId}/status`);
  }

  async deleteWebsiteScraperJob(jobId: string): Promise<{ message: string; job_id: string }> {
    return this.request(`/api/v1/website-scraper/jobs/${jobId}`, {
      method: "DELETE",
    });
  }

  async downloadWebsiteScraperResults(jobId: string): Promise<void> {
    const url = `${this.baseUrl}/api/v1/website-scraper/jobs/${jobId}/download`;
    const token = this.getToken();
    
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({
        detail: response.statusText,
      }));
      throw new Error(error.detail || "Failed to download results");
    }

    // Get filename from Content-Disposition header or use default
    const contentDisposition = response.headers.get("Content-Disposition");
    let filename = "results_with_contacts.csv";
    if (contentDisposition) {
      const match = contentDisposition.match(/filename="?([^"]+)"?/);
      if (match) {
        filename = match[1];
      }
    }

    // Download the blob
    const blob = await response.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(downloadUrl);
  }

  async getWebsiteScraperPreview(jobId: string, limit = 25): Promise<WebsiteScraperPreviewResponse> {
    return this.request(`/api/v1/website-scraper/jobs/${jobId}/preview?limit=${limit}`);
  }

  // ============================================
  // ENRICHMENT API (Single Email Enrichment)
  // ============================================

  // ============================================
  // SUPPORT
  // ============================================

  async submitSupportTicket(data: {
    category: "question" | "bug" | "feature_request" | "billing" | "other";
    subject: string;
    message: string;
  }): Promise<{ message: string }> {
    return this.request("/api/v1/support/submit", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async enrichSingle(params: EnrichRequest, apiKey: string): Promise<EnrichResponse> {
    const url = `${this.baseUrl}/api/v1/enrich`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({
        detail: response.statusText,
      }));
      throw new Error(error.detail || "Enrichment failed");
    }

    return response.json();
  }
}

export const apiClient = new ApiClient(API_URL);

