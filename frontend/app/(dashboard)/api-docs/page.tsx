"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";

interface Endpoint {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  name: string;
  description: string;
  authRequired: boolean;
  pathParams?: Array<{ name: string; type: string; required: boolean; description: string }>;
  queryParams?: Array<{ name: string; type: string; required: boolean; description: string }>;
  bodyParams?: Array<{ name: string; type: string; required: boolean; description: string }>;
  requestExample?: any;
  responseExample?: any;
  category: string;
  isFileUpload?: boolean;
}

interface TryItOutState {
  pathParams: Record<string, string>;
  queryParams: Record<string, string>;
  body: string;
  apiKey: string;
  loading: boolean;
  response: {
    status: number;
    statusText: string;
    body: string;
    duration: number;
  } | null;
  error: string | null;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.billionverifier.io";

const endpoints: Endpoint[] = [
  {
    method: "POST",
    path: "/api/v1/jobs/upload",
    name: "Upload CSV (Enrichment)",
    description: "Upload CSV file for email enrichment (with permutation logic)",
    authRequired: true,
    isFileUpload: true,
    bodyParams: [
      { name: "file", type: "file (multipart/form-data)", required: true, description: "CSV file with leads" },
      { name: "column_first_name", type: "string", required: false, description: "CSV column name for first name" },
      { name: "column_last_name", type: "string", required: false, description: "CSV column name for last name" },
      { name: "column_website", type: "string", required: false, description: "CSV column name for website" },
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
    name: "Upload CSV (Verification)",
    description: "Upload CSV file for verification only (no permutation logic)",
    authRequired: true,
    isFileUpload: true,
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
    name: "List Jobs",
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
    name: "Get Job Details",
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
    name: "Get Job Progress",
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
    path: "/api/v1/jobs/{job_id}/cancel",
    name: "Cancel Job",
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
  {
    method: "GET",
    path: "/api/v1/results/{job_id}",
    name: "Get Results",
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
  {
    method: "POST",
    path: "/api/v1/test-email",
    name: "Test Single Email",
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

const categories = Array.from(new Set(endpoints.map((e) => e.category)));

function getMethodColor(method: string) {
  switch (method) {
    case "GET": return "bg-green-500/20 text-green-400 border-green-500/30";
    case "POST": return "bg-blue-500/20 text-blue-400 border-blue-500/30";
    case "PUT": return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
    case "DELETE": return "bg-red-500/20 text-red-400 border-red-500/30";
    default: return "bg-gray-500/20 text-gray-400 border-gray-500/30";
  }
}

function getMethodDot(method: string) {
  switch (method) {
    case "GET": return "bg-green-400";
    case "POST": return "bg-blue-400";
    case "PUT": return "bg-yellow-400";
    case "DELETE": return "bg-red-400";
    default: return "bg-gray-400";
  }
}

function getStatusColor(status: number) {
  if (status >= 200 && status < 300) return "text-green-400";
  if (status >= 400 && status < 500) return "text-yellow-400";
  return "text-red-400";
}

function getEndpointId(endpoint: Endpoint, index: number) {
  return `${endpoint.method}-${endpoint.path}-${index}`;
}

function generateCurlExample(endpoint: Endpoint, apiKey: string) {
  const fullUrl = `${API_BASE_URL}${endpoint.path.replace(/\{(\w+)\}/g, "<$1>")}`;
  let curl = `curl --request ${endpoint.method} \\\n`;
  curl += `  --url ${fullUrl}`;
  if (endpoint.queryParams && endpoint.queryParams.length > 0) {
    const qs = endpoint.queryParams.map((p) => `${p.name}=<${p.name}>`).join("&");
    curl += `?${qs}`;
  }
  curl += ` \\\n`;
  if (endpoint.authRequired) {
    curl += `  --header 'x-api-key: ${apiKey}' \\\n`;
  }
  if (endpoint.method === "POST" || endpoint.method === "PUT") {
    curl += `  --header 'Content-Type: application/json'`;
    if (endpoint.requestExample) {
      curl += ` \\\n  --data '${JSON.stringify(endpoint.requestExample, null, 2)}'`;
    }
  }
  return curl;
}

function generateMarkdownExport() {
  let md = `# Billion Verifier API Reference\n\n`;
  md += `**Base URL:** \`${API_BASE_URL}\`\n\n`;
  md += `## Authentication\n\nInclude your API key in every request:\n\n\`\`\`\nx-api-key: <your-api-key>\n\`\`\`\n\n---\n\n`;

  for (const cat of categories) {
    md += `## ${cat}\n\n`;
    const catEndpoints = endpoints.filter((e) => e.category === cat);
    for (const ep of catEndpoints) {
      md += `### ${ep.name}\n\n`;
      md += `\`${ep.method}\` \`${ep.path}\`\n\n`;
      md += `${ep.description}\n\n`;

      if (ep.pathParams && ep.pathParams.length > 0) {
        md += `**Path Parameters:**\n\n| Name | Type | Required | Description |\n|------|------|----------|-------------|\n`;
        for (const p of ep.pathParams) {
          md += `| \`${p.name}\` | ${p.type} | ${p.required ? "Yes" : "No"} | ${p.description} |\n`;
        }
        md += `\n`;
      }
      if (ep.queryParams && ep.queryParams.length > 0) {
        md += `**Query Parameters:**\n\n| Name | Type | Required | Description |\n|------|------|----------|-------------|\n`;
        for (const p of ep.queryParams) {
          md += `| \`${p.name}\` | ${p.type} | ${p.required ? "Yes" : "No"} | ${p.description} |\n`;
        }
        md += `\n`;
      }
      if (ep.bodyParams && ep.bodyParams.length > 0) {
        md += `**Body Parameters:**\n\n| Name | Type | Required | Description |\n|------|------|----------|-------------|\n`;
        for (const p of ep.bodyParams) {
          md += `| \`${p.name}\` | ${p.type} | ${p.required ? "Yes" : "No"} | ${p.description} |\n`;
        }
        md += `\n`;
      }

      md += `**cURL Example:**\n\n\`\`\`bash\n${generateCurlExample(ep, "<your-api-key>")}\n\`\`\`\n\n`;

      if (ep.responseExample) {
        const resp = typeof ep.responseExample === "string" ? ep.responseExample : JSON.stringify(ep.responseExample, null, 2);
        md += `**Response (200):**\n\n\`\`\`json\n${resp}\n\`\`\`\n\n`;
      }
      md += `---\n\n`;
    }
  }
  return md;
}

// ─── Page Component ──────────────────────────────────────────────────────────

export default function ApiDocsPage() {
  const { user } = useAuth();
  const [activeEndpointIdx, setActiveEndpointIdx] = useState(0);
  const [tryItOutModal, setTryItOutModal] = useState<string | null>(null);
  const [tryItOutStates, setTryItOutStates] = useState<Record<string, TryItOutState>>({});
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const apiKey = user?.api_key || "<your-api-key>";

  const contentRef = useRef<HTMLDivElement>(null);

  const scrollToEndpoint = (idx: number) => {
    setActiveEndpointIdx(idx);
    const ep = endpoints[idx];
    const id = getEndpointId(ep, idx);
    const el = sectionRefs.current[id];
    if (el && contentRef.current) {
      const top = el.offsetTop - 32;
      contentRef.current.scrollTo({ top, behavior: "smooth" });
    }
  };

  const initTryItOut = useCallback((endpointId: string, endpoint: Endpoint) => {
    if (tryItOutStates[endpointId]) return;
    const pathParams: Record<string, string> = {};
    endpoint.pathParams?.forEach((p) => { pathParams[p.name] = ""; });
    const queryParams: Record<string, string> = {};
    endpoint.queryParams?.forEach((p) => { queryParams[p.name] = ""; });
    setTryItOutStates((prev) => ({
      ...prev,
      [endpointId]: {
        pathParams,
        queryParams,
        body: endpoint.requestExample ? JSON.stringify(endpoint.requestExample, null, 2) : "",
        apiKey: user?.api_key || "",
        loading: false,
        response: null,
        error: null,
      },
    }));
  }, [tryItOutStates, user?.api_key]);

  const updateTryItOutState = (endpointId: string, updates: Partial<TryItOutState>) => {
    setTryItOutStates((prev) => ({
      ...prev,
      [endpointId]: { ...prev[endpointId], ...updates },
    }));
  };

  const sendRequest = async (endpointId: string, endpoint: Endpoint) => {
    const state = tryItOutStates[endpointId];
    if (!state) return;
    updateTryItOutState(endpointId, { loading: true, response: null, error: null });

    let resolvedPath = endpoint.path;
    if (endpoint.pathParams) {
      for (const param of endpoint.pathParams) {
        const value = state.pathParams[param.name];
        if (!value && param.required) {
          updateTryItOutState(endpointId, { loading: false, error: `Missing required path parameter: ${param.name}` });
          return;
        }
        resolvedPath = resolvedPath.replace(`{${param.name}}`, encodeURIComponent(value));
      }
    }

    let url = `${API_BASE_URL}${resolvedPath}`;
    if (endpoint.queryParams) {
      const params = new URLSearchParams();
      for (const param of endpoint.queryParams) {
        const value = state.queryParams[param.name];
        if (value) params.set(param.name, value);
        else if (param.required) {
          updateTryItOutState(endpointId, { loading: false, error: `Missing required query parameter: ${param.name}` });
          return;
        }
      }
      const qs = params.toString();
      if (qs) url += `?${qs}`;
    }

    const headers: Record<string, string> = {};
    if (endpoint.authRequired && state.apiKey) headers["X-API-Key"] = state.apiKey;
    const fetchOptions: RequestInit = { method: endpoint.method, headers };
    if ((endpoint.method === "POST" || endpoint.method === "PUT") && state.body && !endpoint.isFileUpload) {
      headers["Content-Type"] = "application/json";
      fetchOptions.body = state.body;
    }

    const startTime = performance.now();
    try {
      const res = await fetch(url, fetchOptions);
      const duration = Math.round(performance.now() - startTime);
      let bodyText: string;
      try {
        const json = await res.json();
        bodyText = JSON.stringify(json, null, 2);
      } catch {
        bodyText = await res.text().catch(() => "(empty response)");
      }
      updateTryItOutState(endpointId, {
        loading: false,
        response: { status: res.status, statusText: res.statusText, body: bodyText, duration },
      });
    } catch (err: any) {
      const duration = Math.round(performance.now() - startTime);
      updateTryItOutState(endpointId, {
        loading: false,
        error: `Network error: ${err.message || "Failed to connect"}`,
        response: { status: 0, statusText: "Network Error", body: err.message || "Failed to fetch", duration },
      });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const downloadMarkdown = () => {
    const md = generateMarkdownExport();
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "billion-verifier-api-docs.md";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Hide the main dashboard sidebar and expand content to full width
  useEffect(() => {
    const sidebar = document.querySelector("aside.fixed.left-0") as HTMLElement | null;
    const wrapper = document.querySelector(".ml-\\[250px\\]") as HTMLElement | null;
    const header = wrapper?.querySelector("header") as HTMLElement | null;
    if (sidebar) sidebar.style.display = "none";
    if (wrapper) wrapper.style.marginLeft = "0";
    if (header) header.style.display = "none";
    return () => {
      if (sidebar) sidebar.style.display = "";
      if (wrapper) wrapper.style.marginLeft = "";
      if (header) header.style.display = "";
    };
  }, []);

  // Track active section on scroll
  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const idx = endpoints.findIndex((ep, i) => getEndpointId(ep, i) === entry.target.id);
            if (idx !== -1) setActiveEndpointIdx(idx);
          }
        }
      },
      { root, rootMargin: "-10% 0px -70% 0px" }
    );
    Object.values(sectionRefs.current).forEach((el) => {
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  return (
    <div className="fixed inset-0 flex bg-dashboard-dark" style={{ zIndex: 9999 }}>
      {/* ─── Sidebar (replaces main dashboard sidebar) ─── */}
      <aside className="w-[250px] shrink-0 h-screen bg-dashboard-surface border-r border-dashboard-border flex flex-col">
        {/* Logo */}
        <div className="p-6 border-b border-dashboard-border">
          <div className="flex items-center justify-center gap-2">
            <svg className="w-6 h-6" fill="#0099FF" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
            </svg>
            <span className="text-dashboard-accent font-bold text-lg tracking-tight">
              Billion Verifier
            </span>
          </div>
        </div>

        {/* Top nav links */}
        <div className="p-4 space-y-1">
          <a
            href="/sales-nav-scraper"
            className="flex items-center gap-3 px-4 py-3 rounded-lg text-dashboard-text-muted hover:bg-dashboard-card hover:text-dashboard-text transition-all"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            <span className="text-sm">Dashboard</span>
          </a>
          <a
            href="/support"
            className="flex items-center gap-3 px-4 py-3 rounded-lg text-dashboard-text-muted hover:bg-dashboard-card hover:text-dashboard-text transition-all"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            <span className="text-sm">Support</span>
          </a>
        </div>

        {/* API Reference nav */}
        <nav className="flex-1 overflow-y-auto px-4 pb-4">
          {categories.map((cat) => (
            <div key={cat} className="mb-6">
              <h3 className="text-xs font-semibold text-dashboard-text-muted uppercase tracking-wide px-4 mb-2">{cat}</h3>
              <div className="space-y-1">
                {endpoints.map((ep, idx) => {
                  if (ep.category !== cat) return null;
                  const isActive = activeEndpointIdx === idx;
                  return (
                    <button
                      key={idx}
                      onClick={() => scrollToEndpoint(idx)}
                      className={`w-full flex items-center gap-2.5 px-4 py-2 rounded-lg text-left transition-colors ${
                        isActive
                          ? "bg-dashboard-accent/10 text-dashboard-accent"
                          : "text-dashboard-text-muted hover:bg-dashboard-card hover:text-dashboard-text"
                      }`}
                    >
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${getMethodColor(ep.method)}`}>
                        {ep.method.slice(0, 3)}
                      </span>
                      <span className="text-sm font-medium truncate">{ep.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Bottom section */}
        <div className="p-4 border-t border-dashboard-border space-y-3">
          <button
            onClick={downloadMarkdown}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium bg-dashboard-card border border-dashboard-border text-dashboard-text-muted hover:text-dashboard-text hover:bg-dashboard-surface/80 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Export Markdown
          </button>

          {user && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-dashboard-card border border-dashboard-border">
              <div className="w-8 h-8 rounded-full bg-dashboard-accent/20 flex items-center justify-center text-dashboard-accent font-semibold text-xs">
                {user.full_name?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase() || "U"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-dashboard-text truncate">{user.full_name || "User"}</p>
                <p className="text-xs text-dashboard-text-muted truncate">{user.email}</p>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* ─── Main Content ─── */}
      <div className="flex-1 overflow-y-auto" ref={contentRef}>
        <div className="max-w-5xl mx-auto px-6 py-8">
          {/* Header */}
          <div className="mb-10">
            <h1 className="text-3xl font-bold text-dashboard-text mb-2">API Reference</h1>
            <p className="text-sm text-dashboard-text-muted">
              Complete API reference for Billion Verifier. Base URL: <span className="text-dashboard-accent font-medium">{API_BASE_URL}</span>
            </p>
          </div>

          {/* API Key Card */}
          <div className="glass-card p-4 mb-10 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-sm font-medium text-dashboard-text-muted shrink-0">Your API Key:</span>
              <span className="text-sm text-dashboard-accent font-medium truncate">{user?.api_key || "Sign in to see your key"}</span>
            </div>
            {user?.api_key && (
              <button
                onClick={() => copyToClipboard(user.api_key || "")}
                className="btn-secondary text-sm px-3 py-1.5 shrink-0"
              >
                Copy
              </button>
            )}
          </div>

          {/* ─── Endpoint Sections ─── */}
          {endpoints.map((endpoint, index) => {
            const endpointId = getEndpointId(endpoint, index);
            const curlExample = generateCurlExample(endpoint, apiKey);
            const responseStr = endpoint.responseExample
              ? typeof endpoint.responseExample === "string"
                ? endpoint.responseExample
                : JSON.stringify(endpoint.responseExample, null, 2)
              : null;

            return (
              <section
                key={endpointId}
                id={endpointId}
                ref={(el) => { sectionRefs.current[endpointId] = el; }}
                className="mb-12 scroll-mt-8"
              >
                {/* Category label */}
                {(index === 0 || endpoints[index - 1].category !== endpoint.category) && (
                  <div className="mb-6 mt-8">
                    <h2 className="text-sm font-semibold text-dashboard-accent">{endpoint.category}</h2>
                  </div>
                )}

                {/* Endpoint card */}
                <div className="glass-card overflow-hidden antialiased">
                  {/* Top bar: method + path + Try it out */}
                  <div className="flex items-center justify-between p-4 border-b border-dashboard-border">
                    <div className="flex items-center gap-3">
                      <span className={`px-2.5 py-1 rounded text-xs font-semibold border ${getMethodColor(endpoint.method)}`}>
                        {endpoint.method}
                      </span>
                      <span className="text-sm text-dashboard-text font-medium">{endpoint.path}</span>
                    </div>
                    {endpoint.isFileUpload ? (
                      <span className="text-xs text-dashboard-text-muted">multipart/form-data</span>
                    ) : (
                      <button
                        onClick={() => {
                          initTryItOut(endpointId, endpoint);
                          setTryItOutModal(endpointId);
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-dashboard-accent text-white hover:bg-dashboard-accent/90 transition-colors"
                      >
                        Try it
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </button>
                    )}
                  </div>

                  {/* Two-column content */}
                  <div className="flex flex-col lg:flex-row">
                    {/* Left: Details */}
                    <div className="flex-1 p-5 space-y-6 border-b lg:border-b-0 lg:border-r border-dashboard-border">
                      <div>
                        <h3 className="text-lg font-semibold text-dashboard-text mb-2">{endpoint.name}</h3>
                        <p className="text-sm text-dashboard-text-muted leading-relaxed">{endpoint.description}</p>
                      </div>

                      {/* Parameters */}
                      {[
                        { label: "Path Parameters", params: endpoint.pathParams },
                        { label: "Query Parameters", params: endpoint.queryParams },
                        { label: "Body", params: endpoint.bodyParams },
                      ].map(({ label, params }) =>
                        params && params.length > 0 ? (
                          <div key={label}>
                            <h4 className="text-sm font-semibold text-dashboard-text mb-3">{label}</h4>
                            <div className="space-y-3">
                              {params.map((p) => (
                                <div key={p.name} className="flex items-start gap-4 py-2 border-b border-dashboard-border/50 last:border-0">
                                  <div className="flex items-center gap-2 min-w-[160px]">
                                    <span className="text-sm font-medium text-dashboard-accent">{p.name}</span>
                                    <span className="text-xs text-dashboard-text-muted bg-dashboard-surface px-1.5 py-0.5 rounded">{p.type}</span>
                                    {p.required && <span className="text-xs font-medium text-red-400">required</span>}
                                  </div>
                                  <span className="text-sm text-dashboard-text-muted leading-relaxed">{p.description}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null
                      )}
                    </div>

                    {/* Right: cURL + Response */}
                    <div className="lg:w-[380px] shrink-0 p-5 space-y-4" style={{ background: "rgba(13, 15, 18, 0.5)" }}>
                      {/* cURL */}
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-xs font-semibold text-dashboard-text">cURL</span>
                          <button
                            onClick={() => copyToClipboard(curlExample)}
                            className="text-xs text-dashboard-accent hover:text-dashboard-accent/80"
                          >
                            Copy
                          </button>
                        </div>
                        <pre className="rounded-lg bg-[#0a0c0f] p-3 overflow-x-auto">
                          <code className="text-xs text-dashboard-text-muted whitespace-pre-wrap font-mono leading-relaxed">{curlExample}</code>
                        </pre>
                      </div>

                      {/* Response Example */}
                      {responseStr && (
                        <div>
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-dashboard-text">Response</span>
                              <span className="px-1.5 py-0.5 rounded text-xs font-semibold bg-green-500/20 text-green-400">200</span>
                            </div>
                            <button
                              onClick={() => copyToClipboard(responseStr)}
                              className="text-xs text-dashboard-accent hover:text-dashboard-accent/80"
                            >
                              Copy
                            </button>
                          </div>
                          <pre className="rounded-lg bg-[#0a0c0f] p-3 overflow-x-auto max-h-[300px] overflow-y-auto">
                            <code className="text-xs text-green-300/80 whitespace-pre-wrap font-mono leading-relaxed">{responseStr}</code>
                          </pre>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </section>
            );
          })}

        </div>
      </div>

      {/* ─── Try It Out Modal ─── */}
      {tryItOutModal && (() => {
        const idx = endpoints.findIndex((ep, i) => getEndpointId(ep, i) === tryItOutModal);
        if (idx === -1) return null;
        const endpoint = endpoints[idx];
        const endpointId = tryItOutModal;
        const tryState = tryItOutStates[endpointId];
        if (!tryState) return null;

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center"
            onClick={() => setTryItOutModal(null)}
          >
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
            <div
              className="relative z-10 w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-xl border border-dashboard-border shadow-2xl"
              style={{ background: "rgba(17, 19, 24, 0.97)" }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="sticky top-0 z-10 flex items-center justify-between p-4 border-b border-dashboard-border antialiased" style={{ background: "rgba(17, 19, 24, 0.98)" }}>
                <div className="flex items-center gap-3">
                  <span className={`px-2.5 py-1 rounded text-xs font-semibold border ${getMethodColor(endpoint.method)}`}>
                    {endpoint.method}
                  </span>
                  <span className="text-sm font-medium text-dashboard-text">{endpoint.path}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => sendRequest(endpointId, endpoint)}
                    disabled={tryState.loading}
                    className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium bg-dashboard-accent text-white hover:bg-dashboard-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {tryState.loading ? (
                      <>
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Sending...
                      </>
                    ) : "Send"}
                  </button>
                  <button
                    onClick={() => setTryItOutModal(null)}
                    className="p-1.5 rounded-lg text-dashboard-text-muted hover:text-dashboard-text hover:bg-dashboard-surface/60 transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Modal Body */}
              <div className="p-5 space-y-6">
                <div>
                  <h3 className="text-base font-semibold text-dashboard-text mb-1">{endpoint.name}</h3>
                  <p className="text-sm text-dashboard-text-muted leading-relaxed">{endpoint.description}</p>
                </div>

                {/* API Key */}
                {endpoint.authRequired && (
                  <div>
                    <label className="text-sm font-semibold text-dashboard-text block mb-3">Authorization</label>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-dashboard-text-muted font-medium bg-dashboard-surface/60 px-3 py-2 rounded border border-dashboard-border shrink-0">x-api-key</span>
                      <input
                        type="text"
                        value={tryState.apiKey}
                        onChange={(e) => updateTryItOutState(endpointId, { apiKey: e.target.value })}
                        placeholder="enter x-api-key"
                        className="flex-1 text-sm bg-dashboard-surface/40 text-dashboard-text border border-dashboard-border rounded px-3 py-2 focus:outline-none focus:border-dashboard-accent/50"
                      />
                    </div>
                  </div>
                )}

                {/* Path Params */}
                {endpoint.pathParams && endpoint.pathParams.length > 0 && (
                  <div>
                    <label className="text-sm font-semibold text-dashboard-text block mb-3">Path Parameters</label>
                    <div className="space-y-3">
                      {endpoint.pathParams.map((param) => (
                        <div key={param.name} className="flex items-center gap-3">
                          <span className="text-sm font-medium text-dashboard-accent bg-dashboard-surface/60 px-3 py-2 rounded border border-dashboard-border min-w-[100px] shrink-0">
                            {param.name}
                            {param.required && <span className="text-red-400 ml-1">*</span>}
                          </span>
                          <input
                            type="text"
                            value={tryState.pathParams[param.name] || ""}
                            onChange={(e) => updateTryItOutState(endpointId, {
                              pathParams: { ...tryState.pathParams, [param.name]: e.target.value },
                            })}
                            placeholder={param.description}
                            className="flex-1 text-sm bg-dashboard-surface/40 text-dashboard-text border border-dashboard-border rounded px-3 py-2 focus:outline-none focus:border-dashboard-accent/50"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Query Params */}
                {endpoint.queryParams && endpoint.queryParams.length > 0 && (
                  <div>
                    <label className="text-sm font-semibold text-dashboard-text block mb-3">Query Parameters</label>
                    <div className="space-y-3">
                      {endpoint.queryParams.map((param) => (
                        <div key={param.name} className="flex items-center gap-3">
                          <span className="text-sm font-medium text-dashboard-accent bg-dashboard-surface/60 px-3 py-2 rounded border border-dashboard-border min-w-[100px] shrink-0">
                            {param.name}
                            {param.required && <span className="text-red-400 ml-1">*</span>}
                          </span>
                          <input
                            type="text"
                            value={tryState.queryParams[param.name] || ""}
                            onChange={(e) => updateTryItOutState(endpointId, {
                              queryParams: { ...tryState.queryParams, [param.name]: e.target.value },
                            })}
                            placeholder={param.description}
                            className="flex-1 text-sm bg-dashboard-surface/40 text-dashboard-text border border-dashboard-border rounded px-3 py-2 focus:outline-none focus:border-dashboard-accent/50"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Body */}
                {(endpoint.method === "POST" || endpoint.method === "PUT") && !endpoint.isFileUpload && (
                  <div>
                    <label className="text-sm font-semibold text-dashboard-text block mb-3">Body</label>
                    <textarea
                      value={tryState.body}
                      onChange={(e) => updateTryItOutState(endpointId, { body: e.target.value })}
                      rows={Math.max(4, (tryState.body.match(/\n/g) || []).length + 2)}
                      spellCheck={false}
                      className="w-full text-sm font-mono bg-[#0a0c0f] text-dashboard-text border border-dashboard-border rounded-lg px-4 py-3 focus:outline-none focus:border-dashboard-accent/50 resize-y"
                    />
                  </div>
                )}

                {/* Error */}
                {tryState.error && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                    <svg className="w-4 h-4 text-red-400 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-sm text-red-400">{tryState.error}</span>
                  </div>
                )}

                {/* Response */}
                {tryState.response && (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <label className="text-sm font-semibold text-dashboard-text">Response</label>
                      <div className="flex items-center gap-3">
                        <span className={`text-sm font-semibold ${getStatusColor(tryState.response.status)}`}>
                          {tryState.response.status} {tryState.response.statusText}
                        </span>
                        <span className="text-xs text-dashboard-text-muted">{tryState.response.duration}ms</span>
                        <button
                          onClick={() => copyToClipboard(tryState.response?.body || "")}
                          className="text-xs text-dashboard-accent hover:text-dashboard-accent/80"
                        >
                          Copy
                        </button>
                      </div>
                    </div>
                    <pre className="rounded-lg bg-[#0a0c0f] p-4 overflow-x-auto max-h-[300px] overflow-y-auto border border-dashboard-border">
                      <code className={`text-sm whitespace-pre-wrap font-mono leading-relaxed ${
                        tryState.response.status >= 200 && tryState.response.status < 300
                          ? "text-green-300/90"
                          : "text-red-300/90"
                      }`}>
                        {tryState.response.body}
                      </code>
                    </pre>
                  </div>
                )}

                {/* Empty state */}
                {!tryState.response && !tryState.error && !tryState.loading && (
                  <div className="flex flex-col items-center justify-center py-10 text-dashboard-text-muted">
                    <svg className="w-8 h-8 mb-2 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    <span className="text-sm">Click Send to get a response</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
