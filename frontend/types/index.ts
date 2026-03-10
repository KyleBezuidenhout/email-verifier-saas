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
  job_name?: string; // Optional user-provided job name
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
  failure_reason?: string;  // Human-readable reason when status is 'failed'
  credits_charged?: number;  // Credits deducted for this order
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
  linkedin_cookie?: string;  // Optional -- fallback session used if not provided
  targeting?: string;  // Job name/targeting description
}

// Google Maps Scraper Types (via Apify compass/crawler-google-places)
export interface ApifySettings {
  max_results_per_city?: number | null;  // null = unlimited
  skip_closed_places: boolean;
  website_filter: 'allPlaces' | 'withWebsite' | 'withoutWebsite';
  scrape_reviews: boolean;
  max_reviews: number;
  scrape_images: boolean;
  max_images: number;
  language: string;
}

export interface GoogleMapsScraperOrderCreate {
  job_name: string;
  scrape_mode: 'single_city' | 'full_state';
  states: string[];  // List of states (single for single_city, multiple for full_state admin)
  city?: string | null;  // Required for single_city mode
  search_term: string;
  // Cache option - returns cached results for matching city+state+search_term
  use_cache?: boolean;
  // Apify settings (optional - defaults applied if not provided)
  max_results_per_city?: number | null;
  skip_closed_places?: boolean;
  website_filter?: 'allPlaces' | 'withWebsite' | 'withoutWebsite';
  scrape_reviews?: boolean;
  max_reviews?: number;
  scrape_images?: boolean;
  max_images?: number;
  language?: string;
}

export interface GoogleMapsScraperOrder {
  id: string;
  user_id: string;
  status: 'pending' | 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
  scrape_mode: 'single_city' | 'full_state';
  states: string[];  // List of states being scraped
  city: string | null;
  search_term: string;
  job_name: string;
  total_cities: number;
  completed_cities: number;
  progress_percentage: number;
  results_count: number;
  estimated_cost: number;
  actual_cost: number | null;
  file_url: string | null;
  created_at: string;
  completed_at: string | null;
  error_message: string | null;
  // Apify settings
  max_results_per_city?: number | null;
  skip_closed_places?: boolean;
  website_filter?: string;
  scrape_reviews?: boolean;
  max_reviews?: number;
  scrape_images?: boolean;
  max_images?: number;
  language?: string;
}

export interface GoogleMapsScraperHealthStatus {
  apify_api: 'connected' | 'disconnected';
  message: string;
}

export interface GoogleMapsScraperCostEstimate {
  num_cities: number;
  estimated_cost: number;
  cost_per_city: number;
}

export interface GoogleMapsScraperPreviewResponse {
  order_id: string;
  total_rows: number;
  preview_count: number;
  columns: string[];
  rows: Record<string, string>[];
}

// Website Contact Scraper Types (ZenRows API for email/phone extraction)
export interface WebsiteScraperJob {
  id: string;
  user_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  original_filename?: string;
  job_name?: string; // Optional user-provided job name
  total_leads: number;
  completed_leads: number;
  progress_percentage: number;
  hit_rate_percentage: number;
  credits_spent: number;
  input_file_path?: string;
  output_file_path?: string;
  created_at: string;
  completed_at?: string;
  error_message?: string;
}

export interface WebsiteScraperHealthStatus {
  zenrows_api: 'connected' | 'disconnected';
  message: string;
}

export interface WebsiteScraperUploadResponse {
  job_id: string;
  message: string;
  total_websites: number;
}

export interface WebsiteScraperPreviewRow {
  [key: string]: string;  // Dynamic columns from original CSV + extracted contacts
}

export interface WebsiteScraperPreviewResponse {
  job_id: string;
  total_rows: number;
  preview_count: number;
  columns: string[];
  rows: WebsiteScraperPreviewRow[];
  hit_rate_percentage: number;
}

