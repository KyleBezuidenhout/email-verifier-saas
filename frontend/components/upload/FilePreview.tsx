"use client";

import { useState, useEffect } from "react";
import Papa, { ParseResult } from "papaparse";

interface FilePreviewProps {
  file: File;
}

export function FilePreview({ file }: FilePreviewProps) {
  const [preview, setPreview] = useState<Record<string, string>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      Papa.parse<Record<string, string>>(text, {
        header: true,
        skipEmptyLines: true,
        complete: (results: ParseResult<Record<string, string>>) => {
          const requiredColumns = ["first_name", "last_name", "website"];
          const fileHeaders = results.meta.fields || [];
          const missingColumns = requiredColumns.filter(
            (col) => !fileHeaders.includes(col)
          );

          if (missingColumns.length > 0) {
            setErrors([
              `Missing required columns: ${missingColumns.join(", ")}`,
            ]);
          } else {
            setErrors([]);
          }

          setHeaders(fileHeaders);
          setPreview(results.data.slice(0, 5));
          setLoading(false);
        },
        error: (error) => {
          setErrors([error.message || "Failed to parse CSV"]);
          setLoading(false);
        },
      });
    };
    reader.readAsText(file);
  }, [file]);

  if (loading) {
    return (
      <div className="mt-4 p-4 bg-gray-50 rounded-lg">
        <p className="text-sm text-gray-600">Loading preview...</p>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-4">
      {errors.length > 0 && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg text-sm">
          {errors.map((error, i) => (
            <p key={i}>{error}</p>
          ))}
        </div>
      )}

      {preview.length > 0 && (
        <div className="bg-white border rounded-lg overflow-hidden">
          <div className="px-4 py-2 bg-gray-50 border-b">
            <p className="text-sm font-medium text-gray-700">
              Preview (first 5 rows)
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {headers.map((header) => (
                    <th
                      key={header}
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {preview.map((row, i) => (
                  <tr key={i}>
                    {headers.map((header) => (
                      <td
                        key={header}
                        className="px-4 py-3 whitespace-nowrap text-sm text-gray-900"
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

