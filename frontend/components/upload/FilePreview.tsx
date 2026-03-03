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
  mode?: 'enrichment' | 'verification' | 'website-scraper'; // 'enrichment' requires first_name, last_name, website; 'verification' requires email; 'website-scraper' requires website only
}

// Column variations for auto-detection
const COLUMN_VARIATIONS: Record<keyof ColumnMapping, string[]> = {
  first_name: ["firstname", "first", "fname", "givenname", "first_name"],
  last_name: ["lastname", "last", "lname", "surname", "familyname", "last_name"],
  website: ["website", "domain", "companywebsite", "companydomain", "url", "companyurl", "company_website", "corporatewebsite", "corporate_website", "corporate-website", "primarydomain", "organization_primary_domain", "organizationprimarydomain"],
  email: ["email", "emailaddress", "e-mail", "email_address", "mail"],
  company_size: [], // Disabled auto-detection - users must select from dropdown
};

const getRequiredColumns = (mode?: 'enrichment' | 'verification' | 'website-scraper'): (keyof ColumnMapping)[] => {
  if (mode === 'verification') {
    return ['email'];
  }
  if (mode === 'website-scraper') {
    return ['website']; // Only requires website column
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
      company_size: "Company Size",
    };
    return labels[col];
  };

  const getColumnsForMode = (m?: 'enrichment' | 'verification' | 'website-scraper'): { key: keyof ColumnMapping; required: boolean }[] => {
    if (m === 'verification') {
      return [
        { key: 'email', required: true },
        { key: 'first_name', required: false },
        { key: 'last_name', required: false },
      ];
    }
    if (m === 'website-scraper') {
      return [{ key: 'website', required: true }];
    }
    return [
      { key: 'first_name', required: true },
      { key: 'last_name', required: true },
      { key: 'website', required: true },
      { key: 'company_size', required: false },
    ];
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
      {/* Column Mapping */}
      <div className="glass-card p-4">
        <h4 className="text-sm font-medium text-dashboard-text mb-3">Column Mapping:</h4>
        {unmappedColumns.length === 0 ? (
          <div className="badge-success px-3 py-2 rounded-lg text-xs flex items-center gap-2 mb-3">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            All required columns detected! Adjust below if needed.
          </div>
        ) : (
          <div className="bg-yellow-900/20 border border-yellow-800 px-3 py-2 rounded-lg text-xs text-yellow-300 mb-3">
            Please select the missing required columns below.
          </div>
        )}
        <div className="space-y-3">
          {getColumnsForMode(mode).map(({ key, required }) => (
            <div key={key} className="flex items-center gap-3">
              <label className="text-sm text-dashboard-text w-44 shrink-0">
                {getColumnLabel(key)}
                {required ? (
                  <span className="text-red-400 ml-1">*</span>
                ) : (
                  <span className="text-dashboard-text-muted ml-1 text-xs">(optional)</span>
                )}
              </label>
              <select
                value={mapping[key] || ""}
                onChange={(e) => handleColumnSelect(key, e.target.value)}
                className={`apple-input flex-1 text-sm ${
                  mapping[key]
                    ? "border-green-700/50"
                    : required
                    ? "border-red-700/50"
                    : ""
                }`}
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

      {/* Preview Table */}
      {preview.length > 0 && (
        <div className="glass-card overflow-hidden">
          <div className="px-4 py-2 border-b border-dashboard-border" style={{ background: 'rgba(13, 15, 18, 0.5)' }}>
            <p className="text-sm font-medium text-dashboard-text">
              Preview (first 5 rows)
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-dashboard-border">
              <thead style={{ background: 'rgba(13, 15, 18, 0.5)' }}>
                <tr>
                  {headers.map((header) => (
                    <th
                      key={header}
                      className="px-4 py-3 text-left text-xs font-medium text-dashboard-text-muted uppercase tracking-wider"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody style={{ background: 'rgba(13, 15, 18, 0.3)' }} className="divide-y divide-dashboard-border">
                {preview.map((row, i) => (
                  <tr key={i}>
                    {headers.map((header) => (
                      <td
                        key={header}
                        className="px-4 py-3 whitespace-nowrap text-sm text-dashboard-text"
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
