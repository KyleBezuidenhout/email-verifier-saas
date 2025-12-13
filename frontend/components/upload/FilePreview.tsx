"use client";

import { useState, useEffect } from "react";
import Papa, { ParseResult } from "papaparse";

interface ColumnMapping {
  first_name?: string;
  last_name?: string;
  website?: string;
  email?: string;
  company_size?: string;
}

interface FilePreviewProps {
  file: File;
  onMappingChange?: (mapping: ColumnMapping, isValid: boolean) => void;
  mode?: 'enrichment' | 'verification'; // 'enrichment' requires first_name, last_name, website; 'verification' requires email
}

// Column variations for auto-detection
const COLUMN_VARIATIONS: Record<keyof ColumnMapping, string[]> = {
  first_name: ["firstname", "first", "fname", "givenname", "first_name"],
  last_name: ["lastname", "last", "lname", "surname", "familyname", "last_name"],
  website: ["website", "domain", "companywebsite", "companydomain", "url", "companyurl", "company_website", "corporatewebsite", "corporate_website", "corporate-website", "primarydomain", "organization_primary_domain", "organizationprimarydomain"],
  email: ["email", "emailaddress", "e-mail", "email_address", "mail"],
  company_size: ["companysize", "company_size", "size", "employees", "employeecount", "headcount", "organizationsize", "organization_size", "orgsize", "org_size", "teamsize", "team_size", "staffcount", "staff_count", "numberofemployees", "num_employees", "employeesnumber", "linkedincompanyemployeecount", "linkedin_company_employee_count", "linkedin-company-employee-count", "linkedincompanyemployee", "linkedin_company_employee", "linkedin-company-employee"],
};

const getRequiredColumns = (mode?: 'enrichment' | 'verification'): (keyof ColumnMapping)[] => {
  if (mode === 'verification') {
    return ['email'];
  }
  return ['first_name', 'last_name', 'website'];
};

// Normalize header for comparison
const normalizeHeader = (h: string) => h.toLowerCase().replace(/[\s_-]/g, "");

// Try to auto-detect column mapping
const autoDetectColumn = (fileHeaders: string[], targetColumn: keyof ColumnMapping): string | null => {
  const variations = COLUMN_VARIATIONS[targetColumn];
  const normalizedFileHeaders = fileHeaders.map(normalizeHeader);
  
  for (let i = 0; i < normalizedFileHeaders.length; i++) {
    if (variations.includes(normalizedFileHeaders[i])) {
      return fileHeaders[i]; // Return original header name
    }
  }
  return null;
};

export function FilePreview({ file, onMappingChange, mode = 'enrichment' }: FilePreviewProps) {
  const [preview, setPreview] = useState<Record<string, string>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [parseError, setParseError] = useState<string | null>(null);
  
  // Column mapping state
  const [mapping, setMapping] = useState<ColumnMapping>({
    first_name: "",
    last_name: "",
    website: "",
    email: "",
    company_size: "",
  });
  const [unmappedColumns, setUnmappedColumns] = useState<(keyof ColumnMapping)[]>([]);

  useEffect(() => {
    const requiredColumns = getRequiredColumns(mode);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      Papa.parse<Record<string, string>>(text, {
        header: true,
        skipEmptyLines: true,
        complete: (results: ParseResult<Record<string, string>>) => {
          const fileHeaders = results.meta.fields || [];
          
          // Auto-detect column mappings
          const detectedMapping: ColumnMapping = {
            first_name: autoDetectColumn(fileHeaders, "first_name") || "",
            last_name: autoDetectColumn(fileHeaders, "last_name") || "",
            website: autoDetectColumn(fileHeaders, "website") || "",
            email: autoDetectColumn(fileHeaders, "email") || "",
            company_size: autoDetectColumn(fileHeaders, "company_size") || "",
          };
          
          // Find which required columns couldn't be auto-detected
          const needsMapping = requiredColumns.filter(col => !detectedMapping[col]);
          
          setMapping(detectedMapping);
          setUnmappedColumns(needsMapping);
          setHeaders(fileHeaders);
          setPreview(results.data.slice(0, 5));
          setLoading(false);
          
          // Notify parent of mapping validity
          const isValid = needsMapping.length === 0;
          onMappingChange?.(detectedMapping, isValid);
        },
        error: (error: Error) => {
          setParseError(error?.message || "Failed to parse CSV");
          setLoading(false);
        },
      });
    };
    reader.readAsText(file);
  }, [file, onMappingChange, mode]);

  // Handle manual column selection
  const handleColumnSelect = (targetColumn: keyof ColumnMapping, selectedHeader: string) => {
    const newMapping = { ...mapping, [targetColumn]: selectedHeader };
    setMapping(newMapping);
    
    // Update unmapped columns
    const requiredColumns = getRequiredColumns(mode);
    const stillUnmapped = requiredColumns.filter(col => !newMapping[col]);
    setUnmappedColumns(stillUnmapped);
    
    // Notify parent
    const isValid = stillUnmapped.length === 0;
    onMappingChange?.(newMapping, isValid);
  };

  const getColumnLabel = (col: keyof ColumnMapping) => {
    const labels: Record<keyof ColumnMapping, string> = {
      first_name: "First Name",
      last_name: "Last Name",
      website: "Website/Domain",
      email: "Email",
      company_size: "Company Size (optional)",
    };
    return labels[col];
  };

  if (loading) {
    return (
      <div className="mt-4 p-4 bg-gray-50 rounded-lg">
        <p className="text-sm text-gray-600">Loading preview...</p>
      </div>
    );
  }

  if (parseError) {
    return (
      <div className="mt-4 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg text-sm">
        {parseError}
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-4">
      {/* Column Mapping Section - only show if there are unmapped columns */}
      {unmappedColumns.length > 0 && (
        <div className="bg-yellow-900/20 border border-yellow-800 rounded-lg p-4">
          <h4 className="text-sm font-medium text-yellow-300 mb-3">
            📋 Please map the following columns:
          </h4>
          <div className="space-y-3">
            {unmappedColumns.map((col) => (
              <div key={col} className="flex items-center gap-3">
                <label className="text-sm text-apple-text w-40">
                  {getColumnLabel(col)}:
                </label>
                <select
                  value={mapping[col] || ""}
                  onChange={(e) => handleColumnSelect(col, e.target.value)}
                  className="dashbrd-input flex-1 text-sm"
                >
                  <option value="">-- Select column --</option>
                  {headers.map((header) => (
                    <option key={header} value={header}>
                      {header}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Success message when all columns are mapped */}
      {unmappedColumns.length === 0 && (
        <div className="badge-success px-4 py-3 rounded-lg text-sm flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          All required columns detected!
        </div>
      )}

      {/* Column Mapping Summary */}
      <div className="bg-apple-surface border border-apple-border rounded-lg p-4">
        <h4 className="text-sm font-medium text-apple-text mb-2">Column Mapping:</h4>
        <div className="grid grid-cols-2 gap-2 text-sm">
          {mode === 'verification' ? (
            <>
              <div className="text-apple-text-muted">Email →</div>
              <div className={mapping.email ? "text-apple-success font-medium" : "text-apple-error"}>
                {mapping.email || "Not mapped (required)"}
              </div>
              <div className="text-apple-text-muted">First Name →</div>
              <div className={mapping.first_name ? "text-apple-success font-medium" : "text-apple-text-muted"}>
                {mapping.first_name || "Not mapped (optional)"}
              </div>
              <div className="text-apple-text-muted">Last Name →</div>
              <div className={mapping.last_name ? "text-apple-success font-medium" : "text-apple-text-muted"}>
                {mapping.last_name || "Not mapped (optional)"}
              </div>
            </>
          ) : (
            <>
              <div className="text-apple-text-muted">First Name →</div>
              <div className={mapping.first_name ? "text-apple-success font-medium" : "text-apple-error"}>
                {mapping.first_name || "Not mapped"}
              </div>
              <div className="text-apple-text-muted">Last Name →</div>
              <div className={mapping.last_name ? "text-apple-success font-medium" : "text-apple-error"}>
                {mapping.last_name || "Not mapped"}
              </div>
              <div className="text-apple-text-muted">Website →</div>
              <div className={mapping.website ? "text-apple-success font-medium" : "text-apple-error"}>
                {mapping.website || "Not mapped"}
              </div>
              <div className="text-apple-text-muted">Company Size →</div>
              <div className={mapping.company_size ? "text-apple-success font-medium" : "text-apple-text-muted"}>
                {mapping.company_size || "Not mapped (optional)"}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Preview Table */}
      {preview.length > 0 && (
        <div className="dashbrd-card overflow-hidden">
          <div className="px-4 py-2 bg-apple-surface-hover border-b border-apple-border">
            <p className="text-sm font-medium text-apple-text">
              Preview (first 5 rows)
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-apple-border">
              <thead className="bg-apple-surface-hover">
                <tr>
                  {headers.map((header) => (
                    <th
                      key={header}
                      className="px-4 py-3 text-left text-xs font-medium text-apple-text-muted uppercase tracking-wider"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-apple-surface divide-y divide-apple-border">
                {preview.map((row, i) => (
                  <tr key={i}>
                    {headers.map((header) => (
                      <td
                        key={header}
                        className="px-4 py-3 whitespace-nowrap text-sm text-apple-text"
                      >
                        {row[header] || "-"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export type { ColumnMapping };
