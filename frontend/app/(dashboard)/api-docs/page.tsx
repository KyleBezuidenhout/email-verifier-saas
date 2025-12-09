"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";

interface Endpoint {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  description: string;
  authRequired: boolean;
  pathParams?: Array<{ name: string; type: string; required: boolean; description: string }>;
  queryParams?: Array<{ name: string; type: string; required: boolean; description: string }>;
  bodyParams?: Array<{ name: string; type: string; required: boolean; description: string }>;
  requestExample?: any;
  responseExample?: any;
  category: string;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.billionverifier.io";

const endpoints: Endpoint[] = [
  // Authentication
  {
    method: "POST",
    path: "/api/v1/auth/register",
    description: "Register a new user account",
    authRequired: false,
    bodyParams: [
      { name: "email", type: "string", required: true, description: "User email address" },
      { name: "password", type: "string", required: true, description: "User password" },
      { name: "full_name", type: "string", required: true, description: "User's full name" },
      { name: "company_name", type: "string", required: false, description: "Company name (optional)" },
    ],
    requestExample: {
      email: "user@example.com",
      password: "securepassword123",
      full_name: "John Doe",
      company_name: "Acme Corp",
    },
    responseExample: {
      access_token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      token_type: "bearer",
      user: {
        id: "123e4567-e89b-12d3-a456-426614174000",
        email: "user@example.com",
        full_name: "John Doe",
        company_name: "Acme Corp",
        credits: 10,
        api_key: "123e4567-e89b-12d3-a456-426614174001",
        is_active: true,
        created_at: "2024-01-01T00:00:00Z",
      },
    },
    category: "Authentication",
  },
  {
    method: "POST",
    path: "/api/v1/auth/login",
    description: "Login and get access token",
    authRequired: false,
    bodyParams: [
      { name: "email", type: "string", required: true, description: "User email address" },
      { name: "password", type: "string", required: true, description: "User password" },
    ],
    requestExample: {
      email: "user@example.com",
      password: "securepassword123",
    },
    responseExample: {
      access_token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      token_type: "bearer",
      user: {
        id: "123e4567-e89b-12d3-a456-426614174000",
        email: "user@example.com",
        full_name: "John Doe",
        credits: 10,
        api_key: "123e4567-e89b-12d3-a456-426614174001",
        is_active: true,
      },
    },
    category: "Authentication",
  },
  {
    method: "GET",
    path: "/api/v1/auth/me",
    description: "Get current user information",
    authRequired: true,
    responseExample: {
      id: "123e4567-e89b-12d3-a456-426614174000",
      email: "user@example.com",
      full_name: "John Doe",
      company_name: "Acme Corp",
      credits: 10,
      api_key: "123e4567-e89b-12d3-a456-426614174001",
      is_active: true,
      created_at: "2024-01-01T00:00:00Z",
    },
    category: "Authentication",
  },
  {
    method: "PUT",
    path: "/api/v1/auth/me",
    description: "Update current user information",
    authRequired: true,
    bodyParams: [
      { name: "catchall_verifier_api_key", type: "string", required: false, description: "Catchall verifier API key (optional)" },
    ],
    requestExample: {
      catchall_verifier_api_key: "optional-api-key",
    },
    responseExample: {
      id: "123e4567-e89b-12d3-a456-426614174000",
      email: "user@example.com",
      full_name: "John Doe",
      credits: 10,
      api_key: "123e4567-e89b-12d3-a456-426614174001",
      catchall_verifier_api_key: "optional-api-key",
      is_active: true,
    },
    category: "Authentication",
  },
  {
    method: "POST",
    path: "/api/v1/auth/regenerate-api-key",
    description: "Regenerate user's API key. Old key will no longer work.",
    authRequired: true,
    responseExample: {
      id: "123e4567-e89b-12d3-a456-426614174000",
      email: "user@example.com",
      api_key: "new-uuid-api-key",
      credits: 10,
    },
    category: "Authentication",
  },
  // Jobs
  {
    method: "POST",
    path: "/api/v1/jobs/upload",
    description: "Upload CSV file for email enrichment (with permutation logic)",
    authRequired: true,
    bodyParams: [
      { name: "file", type: "file (multipart/form-data)", required: true, description: "CSV file with leads" },
      { name: "company_size", type: "string", required: false, description: "Default company size" },
      { name: "column_first_name", type: "string", required: false, description: "CSV column name for first name" },
      { name: "column_last_name", type: "string", required: false, description: "CSV column name for last name" },
      { name: "column_website", type: "string", required: false, description: "CSV column name for website" },
      { name: "column_company_size", type: "string", required: false, description: "CSV column name for company size" },
    ],
    responseExample: {
      job_id: "123e4567-e89b-12d3-a456-426614174000",
      message: "File uploaded successfully. Processing started.",
    },
    category: "Jobs",
  },
  {
    method: "POST",
    path: "/api/v1/jobs/verify-upload",
    description: "Upload CSV file for verification only (no permutation logic)",
    authRequired: true,
    bodyParams: [
      { name: "file", type: "file (multipart/form-data)", required: true, description: "CSV file with emails" },
      { name: "column_email", type: "string", required: true, description: "CSV column name for email" },
      { name: "column_first_name", type: "string", required: false, description: "CSV column name for first name" },
      { name: "column_last_name", type: "string", required: false, description: "CSV column name for last name" },
    ],
    responseExample: {
      job_id: "123e4567-e89b-12d3-a456-426614174000",
      message: "File uploaded successfully. Processing started.",
    },
    category: "Jobs",
  },
  {
    method: "GET",
    path: "/api/v1/jobs",
    description: "List all jobs for the authenticated user",
    authRequired: true,
    queryParams: [
      { name: "job_type", type: "string", required: false, description: "Filter by job type: 'enrichment' or 'verification'" },
    ],
    responseExample: [
      {
        id: "123e4567-e89b-12d3-a456-426614174000",
        user_id: "123e4567-e89b-12d3-a456-426614174001",
        status: "completed",
        job_type: "enrichment",
        total_leads: 100,
        processed_leads: 100,
        valid_emails_found: 45,
        catchall_emails_found: 10,
        cost_in_credits: 100,
        created_at: "2024-01-01T00:00:00Z",
        completed_at: "2024-01-01T00:05:00Z",
      },
    ],
    category: "Jobs",
  },
  {
    method: "GET",
    path: "/api/v1/jobs/{job_id}",
    description: "Get details of a specific job",
    authRequired: true,
    pathParams: [
      { name: "job_id", type: "string (UUID)", required: true, description: "Job identifier" },
    ],
    responseExample: {
      id: "123e4567-e89b-12d3-a456-426614174000",
      status: "completed",
      job_type: "enrichment",
      total_leads: 100,
      processed_leads: 100,
      valid_emails_found: 45,
      catchall_emails_found: 10,
      cost_in_credits: 100,
      created_at: "2024-01-01T00:00:00Z",
      completed_at: "2024-01-01T00:05:00Z",
    },
    category: "Jobs",
  },
  {
    method: "GET",
    path: "/api/v1/jobs/{job_id}/progress",
    description: "Get real-time job progress (Server-Sent Events)",
    authRequired: true,
    pathParams: [
      { name: "job_id", type: "string (UUID)", required: true, description: "Job identifier" },
    ],
    queryParams: [
      { name: "token", type: "string", required: true, description: "Authentication token" },
    ],
    responseExample: "data: {\"job_id\":\"...\",\"processed_leads\":50,\"total_leads\":100,\"status\":\"processing\",\"progress_percentage\":50}\n\n",
    category: "Jobs",
  },
  {
    method: "POST",
    path: "/api/v1/jobs/{job_id}/verify-catchalls",
    description: "Verify catchall emails from a job using OmniVerifier",
    authRequired: true,
    pathParams: [
      { name: "job_id", type: "string (UUID)", required: true, description: "Job identifier" },
    ],
    responseExample: {
      message: "Verified 5 catchall emails",
      verified_count: 5,
      total_catchalls: 10,
      errors: null,
    },
    category: "Jobs",
  },
  {
    method: "DELETE",
    path: "/api/v1/jobs/{job_id}",
    description: "Delete a job and all associated leads",
    authRequired: true,
    pathParams: [
      { name: "job_id", type: "string (UUID)", required: true, description: "Job identifier" },
    ],
    responseExample: null,
    category: "Jobs",
  },
  {
    method: "POST",
    path: "/api/v1/jobs/{job_id}/cancel",
    description: "Cancel a pending or processing job",
    authRequired: true,
    pathParams: [
      { name: "job_id", type: "string (UUID)", required: true, description: "Job identifier" },
    ],
    responseExample: {
      message: "Job cancelled successfully",
      job_id: "123e4567-e89b-12d3-a456-426614174000",
    },
    category: "Jobs",
  },
  // Results
  {
    method: "GET",
    path: "/api/v1/results/{job_id}",
    description: "Get final results (leads) for a completed job",
    authRequired: true,
    pathParams: [
      { name: "job_id", type: "string (UUID)", required: true, description: "Job identifier" },
    ],
    responseExample: [
      {
        id: 1,
        job_id: "123e4567-e89b-12d3-a456-426614174000",
        first_name: "John",
        last_name: "Doe",
        domain: "example.com",
        email: "john.doe@example.com",
        verification_status: "valid",
        verification_tag: null,
        mx_record: "aspmx.l.google.com",
        mx_provider: "google",
        pattern_used: "first.last",
        prevalence_score: 85,
        is_final_result: true,
        created_at: "2024-01-01T00:00:00Z",
      },
    ],
    category: "Results",
  },
  // Test
  {
    method: "POST",
    path: "/api/v1/test-email",
    description: "Test email enrichment for a single person (public endpoint, no auth required)",
    authRequired: false,
    bodyParams: [
      { name: "name", type: "string", required: true, description: "Full name (e.g., 'John Doe')" },
      { name: "company_website", type: "string", required: true, description: "Company website URL" },
    ],
    requestExample: {
      name: "John Doe",
      company_website: "https://example.com",
    },
    responseExample: {
      name: "John Doe",
      company: "example.com",
      email: "john.doe@example.com",
      status: "valid",
    },
    category: "Test",
  },
];

export default function ApiDocsPage() {
  const { user } = useAuth();
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [expandedEndpoint, setExpandedEndpoint] = useState<string | null>(null);

  const categories = ["All", ...Array.from(new Set(endpoints.map((e) => e.category)))];
  const filteredEndpoints = selectedCategory === "All" 
    ? endpoints 
    : endpoints.filter((e) => e.category === selectedCategory);

  const getMethodColor = (method: string) => {
    switch (method) {
      case "GET":
        return "bg-green-500/20 text-green-400 border-green-500/30";
      case "POST":
        return "bg-blue-500/20 text-blue-400 border-blue-500/30";
      case "PUT":
        return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
      case "DELETE":
        return "bg-red-500/20 text-red-400 border-red-500/30";
      default:
        return "bg-gray-500/20 text-gray-400 border-gray-500/30";
    }
  };

  const generateCurlExample = (endpoint: Endpoint) => {
    const apiKey = user?.api_key || "<your-api-key>";
    const fullUrl = `${API_BASE_URL}${endpoint.path.replace("{job_id}", "<job-id>")}`;
    let curl = `curl --request ${endpoint.method} \\\n`;
    curl += `  --url ${fullUrl}`;
    
    if (endpoint.queryParams && endpoint.queryParams.length > 0) {
      const queryString = endpoint.queryParams
        .map((p) => `${p.name}=<${p.name}>`)
        .join("&");
      curl += `?${queryString}`;
    }
    
    curl += ` \\\n`;
    
    if (endpoint.authRequired) {
      curl += `  --header 'X-API-Key: ${apiKey}' \\\n`;
    }
    
    if (endpoint.method === "POST" || endpoint.method === "PUT") {
      curl += `  --header 'Content-Type: application/json' \\\n`;
      if (endpoint.requestExample) {
        curl += `  --data '${JSON.stringify(endpoint.requestExample, null, 2)}'`;
      }
    }
    
    return curl;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-apple-text mb-2">API Documentation</h1>
        <p className="text-apple-text-muted">
          Complete API reference for integrating with Billion Verifier. Use your API key from Settings to authenticate requests.
        </p>
      </div>

      {/* Authentication Info */}
      <div className="dashbrd-card p-6 mb-8">
        <h2 className="text-lg font-medium text-apple-text mb-4">Authentication</h2>
        <p className="text-sm text-apple-text-muted mb-4">
          Most endpoints require authentication. You can authenticate using either:
        </p>
        <div className="space-y-3">
          <div className="bg-dashbrd-card-hover p-4 rounded-lg border border-apple-border">
            <p className="text-sm font-medium text-apple-text mb-2">Option 1: API Key Header (Recommended for integrations)</p>
            <code className="text-xs text-apple-accent">X-API-Key: {user?.api_key || "<your-api-key>"}</code>
          </div>
          <div className="bg-dashbrd-card-hover p-4 rounded-lg border border-apple-border">
            <p className="text-sm font-medium text-apple-text mb-2">Option 2: Bearer Token (For web UI)</p>
            <code className="text-xs text-apple-accent">Authorization: Bearer &lt;token&gt;</code>
          </div>
        </div>
        {user?.api_key && (
          <div className="mt-4 p-3 bg-apple-accent/10 border border-apple-accent/30 rounded-lg">
            <p className="text-xs text-apple-text-muted mb-1">Your API Key:</p>
            <div className="flex items-center gap-2">
              <code className="text-sm text-apple-accent font-mono flex-1">{user.api_key}</code>
              <button
                onClick={() => copyToClipboard(user.api_key || "")}
                className="btn-secondary text-xs px-3 py-1"
              >
                Copy
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Category Filter */}
      <div className="mb-6 flex flex-wrap gap-2">
        {categories.map((category) => (
          <button
            key={category}
            onClick={() => setSelectedCategory(category)}
            className={`px-4 py-2 rounded-lg text-sm transition-colors ${
              selectedCategory === category
                ? "bg-apple-accent text-white font-medium"
                : "bg-dashbrd-card border border-apple-border text-apple-text-muted hover:bg-dashbrd-card-hover"
            }`}
          >
            {category}
          </button>
        ))}
      </div>

      {/* Endpoints List */}
      <div className="space-y-6">
        {filteredEndpoints.map((endpoint, index) => {
          const endpointId = `${endpoint.method}-${endpoint.path}-${index}`;
          const isExpanded = expandedEndpoint === endpointId;

          return (
            <div key={endpointId} className="dashbrd-card border border-apple-border rounded-lg overflow-hidden">
              {/* Endpoint Header */}
              <div
                className="p-6 cursor-pointer hover:bg-dashbrd-card-hover transition-colors"
                onClick={() => setExpandedEndpoint(isExpanded ? null : endpointId)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className={`px-3 py-1 rounded text-xs font-semibold border ${getMethodColor(endpoint.method)}`}>
                        {endpoint.method}
                      </span>
                      <code className="text-apple-text font-mono text-sm">{endpoint.path}</code>
                      {endpoint.authRequired && (
                        <span className="px-2 py-1 rounded text-xs bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
                          Auth Required
                        </span>
                      )}
                    </div>
                    <p className="text-apple-text-muted text-sm">{endpoint.description}</p>
                  </div>
                  <svg
                    className={`w-5 h-5 text-apple-text-muted transition-transform ${isExpanded ? "rotate-180" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>

              {/* Expanded Content */}
              {isExpanded && (
                <div className="border-t border-apple-border p-6 space-y-6 bg-apple-bg">
                  {/* Path Parameters */}
                  {endpoint.pathParams && endpoint.pathParams.length > 0 && (
                    <div>
                      <h3 className="text-sm font-medium text-apple-text mb-3">Path Parameters</h3>
                      <div className="overflow-x-auto">
                        <table className="min-w-full">
                          <thead>
                            <tr className="border-b border-apple-border">
                              <th className="text-left text-xs font-medium text-apple-text-muted py-2 px-3">Name</th>
                              <th className="text-left text-xs font-medium text-apple-text-muted py-2 px-3">Type</th>
                              <th className="text-left text-xs font-medium text-apple-text-muted py-2 px-3">Required</th>
                              <th className="text-left text-xs font-medium text-apple-text-muted py-2 px-3">Description</th>
                            </tr>
                          </thead>
                          <tbody>
                            {endpoint.pathParams.map((param) => (
                              <tr key={param.name} className="border-b border-apple-border">
                                <td className="py-2 px-3 text-sm text-apple-text font-mono">{param.name}</td>
                                <td className="py-2 px-3 text-sm text-apple-text-muted">{param.type}</td>
                                <td className="py-2 px-3 text-sm text-apple-text-muted">
                                  {param.required ? (
                                    <span className="text-red-400">Yes</span>
                                  ) : (
                                    <span className="text-apple-text-muted">No</span>
                                  )}
                                </td>
                                <td className="py-2 px-3 text-sm text-apple-text-muted">{param.description}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Query Parameters */}
                  {endpoint.queryParams && endpoint.queryParams.length > 0 && (
                    <div>
                      <h3 className="text-sm font-medium text-apple-text mb-3">Query Parameters</h3>
                      <div className="overflow-x-auto">
                        <table className="min-w-full">
                          <thead>
                            <tr className="border-b border-apple-border">
                              <th className="text-left text-xs font-medium text-apple-text-muted py-2 px-3">Name</th>
                              <th className="text-left text-xs font-medium text-apple-text-muted py-2 px-3">Type</th>
                              <th className="text-left text-xs font-medium text-apple-text-muted py-2 px-3">Required</th>
                              <th className="text-left text-xs font-medium text-apple-text-muted py-2 px-3">Description</th>
                            </tr>
                          </thead>
                          <tbody>
                            {endpoint.queryParams.map((param) => (
                              <tr key={param.name} className="border-b border-apple-border">
                                <td className="py-2 px-3 text-sm text-apple-text font-mono">{param.name}</td>
                                <td className="py-2 px-3 text-sm text-apple-text-muted">{param.type}</td>
                                <td className="py-2 px-3 text-sm text-apple-text-muted">
                                  {param.required ? (
                                    <span className="text-red-400">Yes</span>
                                  ) : (
                                    <span className="text-apple-text-muted">No</span>
                                  )}
                                </td>
                                <td className="py-2 px-3 text-sm text-apple-text-muted">{param.description}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Request Body */}
                  {endpoint.bodyParams && endpoint.bodyParams.length > 0 && (
                    <div>
                      <h3 className="text-sm font-medium text-apple-text mb-3">Request Body</h3>
                      <div className="overflow-x-auto">
                        <table className="min-w-full">
                          <thead>
                            <tr className="border-b border-apple-border">
                              <th className="text-left text-xs font-medium text-apple-text-muted py-2 px-3">Name</th>
                              <th className="text-left text-xs font-medium text-apple-text-muted py-2 px-3">Type</th>
                              <th className="text-left text-xs font-medium text-apple-text-muted py-2 px-3">Required</th>
                              <th className="text-left text-xs font-medium text-apple-text-muted py-2 px-3">Description</th>
                            </tr>
                          </thead>
                          <tbody>
                            {endpoint.bodyParams.map((param) => (
                              <tr key={param.name} className="border-b border-apple-border">
                                <td className="py-2 px-3 text-sm text-apple-text font-mono">{param.name}</td>
                                <td className="py-2 px-3 text-sm text-apple-text-muted">{param.type}</td>
                                <td className="py-2 px-3 text-sm text-apple-text-muted">
                                  {param.required ? (
                                    <span className="text-red-400">Yes</span>
                                  ) : (
                                    <span className="text-apple-text-muted">No</span>
                                  )}
                                </td>
                                <td className="py-2 px-3 text-sm text-apple-text-muted">{param.description}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Request Example */}
                  {endpoint.requestExample && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-medium text-apple-text">Request Example</h3>
                        <button
                          onClick={() => copyToClipboard(JSON.stringify(endpoint.requestExample, null, 2))}
                          className="text-xs text-apple-accent hover:text-apple-accent/80"
                        >
                          Copy
                        </button>
                      </div>
                      <pre className="bg-dashbrd-card border border-apple-border rounded-lg p-4 overflow-x-auto">
                        <code className="text-xs text-apple-text-muted">
                          {JSON.stringify(endpoint.requestExample, null, 2)}
                        </code>
                      </pre>
                    </div>
                  )}

                  {/* cURL Example */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-medium text-apple-text">cURL Example</h3>
                      <button
                        onClick={() => copyToClipboard(generateCurlExample(endpoint))}
                        className="text-xs text-apple-accent hover:text-apple-accent/80"
                      >
                        Copy
                      </button>
                    </div>
                    <pre className="bg-dashbrd-card border border-apple-border rounded-lg p-4 overflow-x-auto">
                      <code className="text-xs text-apple-text-muted whitespace-pre-wrap">
                        {generateCurlExample(endpoint)}
                      </code>
                    </pre>
                  </div>

                  {/* Response Example */}
                  {endpoint.responseExample && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-medium text-apple-text">Response Example</h3>
                        <button
                          onClick={() => copyToClipboard(typeof endpoint.responseExample === 'string' ? endpoint.responseExample : JSON.stringify(endpoint.responseExample, null, 2))}
                          className="text-xs text-apple-accent hover:text-apple-accent/80"
                        >
                          Copy
                        </button>
                      </div>
                      <pre className="bg-dashbrd-card border border-apple-border rounded-lg p-4 overflow-x-auto">
                        <code className="text-xs text-apple-text-muted">
                          {typeof endpoint.responseExample === 'string' 
                            ? endpoint.responseExample 
                            : JSON.stringify(endpoint.responseExample, null, 2)}
                        </code>
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

