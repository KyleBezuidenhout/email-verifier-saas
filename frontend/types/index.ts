export interface User {
  id: string;
  email: string;
  full_name?: string;
  company_name?: string;
  credits: number;
  api_key: string;
  catchall_verifier_api_key?: string;
  is_active: boolean;
  is_admin?: boolean;
  created_at: string;
}

export interface Job {
  id: string;
  user_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'waiting_for_csv';
  job_type?: 'enrichment' | 'verification';
  source?: string; // e.g., "Sales Nav"
  original_filename?: string;
  total_leads: number;
  processed_leads: number;
  valid_emails_found: number;
  catchall_emails_found: number;
  cost_in_credits: number;
  input_file_path?: string;
  output_file_path?: string;
  created_at: string;
  completed_at?: string;
}

export interface Lead {
  id: number;
  job_id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  domain: string;
  company_size?: string;
  email: string;
  pattern_used?: string;
  prevalence_score?: number;
  verification_status: 'pending' | 'valid' | 'invalid' | 'catchall' | 'error' | 'not_found';
  verification_tag?: string;
  mx_record?: string;
  mx_provider?: 'outlook' | 'google' | 'other';
  extra_data?: Record<string, string>;
  is_final_result: boolean;
  created_at: string;
}

export interface LoginRequest {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface RegisterRequest {
  email: string;
  password: string;
  full_name: string;
  company_name?: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface JobProgress {
  job_id: string;
  processed_leads: number;
  total_leads: number;
  valid_emails_found: number;
  catchall_emails_found: number;
  status: string;
  progress_percentage: number;
}

export interface UploadResponse {
  job_id: string;
  message: string;
}

// Vayne API Types
export interface VayneAuthStatus {
  is_connected: boolean;
  linkedin_email?: string;
}

export interface VayneCredits {
  // Fields that Vayne API actually returns
  credit_available: number;
  daily_limit_leads: number;
  daily_limit_accounts: number;
  enrichment_credits: number;
  // Optional fields
  subscription_plan?: string;
  subscription_expires?: string;
}

export interface VayneUrlCheck {
  is_valid: boolean;
  estimated_results?: number;
  error?: string;
}

export interface VayneOrder {
  id: string;
  status: 'queued' | 'pending' | 'processing' | 'completed' | 'failed' | 'initialization' | 'scraping' | 'segmenting';
  scraping_status?: 'initialization' | 'scraping' | 'segmenting' | 'finished' | 'failed';  // Direct from Vayne API
  sales_nav_url: string;
  export_format: 'simple' | 'advanced';
  only_qualified: boolean;
  leads_found?: number;
  leads_qualified?: number;
  progress_percentage?: number;
  estimated_completion?: string;
  created_at: string;
  completed_at?: string;
  csv_file_path?: string;  // Deprecated: kept for backwards compatibility
  file_url?: string;  // Direct URL to CSV file from Vayne (for download)
  vayne_order_id: string;  // Vayne's order ID (required for webhook matching)
  targeting?: string;  // Job name/targeting description
  exports?: {
    simple?: {
      status: string;
      file_url?: string;
    };
    advanced?: {
      status: string;
      file_url?: string;
    };
  };
}

export interface VayneOrderCreate {
  sales_nav_url: string;
  linkedin_cookie: string;  // Required for each order
  targeting?: string;  // Job name/targeting description
  estimated_leads?: number;  // Estimated lead count from URL validation (for credit deduction)
}

