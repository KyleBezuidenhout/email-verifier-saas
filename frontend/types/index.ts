export interface User {
  id: string;
  email: string;
  full_name?: string;
  company_name?: string;
  credits: number;
  api_key: string;
  catchall_verifier_api_key?: string;
  is_active: boolean;
  created_at: string;
}

export interface Job {
  id: string;
  user_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  job_type?: 'enrichment' | 'verification';
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

