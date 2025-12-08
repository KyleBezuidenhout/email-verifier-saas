"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { DropZone } from "@/components/upload/DropZone";
import { FilePreview, ColumnMapping } from "@/components/upload/FilePreview";
import { VerificationModeToggle } from "@/components/upload/VerificationModeToggle";
import { SalesNavModal } from "@/components/upload/SalesNavModal";
import { apiClient } from "@/lib/api";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { formatFileSize } from "@/lib/utils";

export default function UploadPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [companySize, setCompanySize] = useState("");
  const [columnMapping, setColumnMapping] = useState<ColumnMapping | null>(null);
  const [isMappingValid, setIsMappingValid] = useState(false);
  const [isVerificationOnly, setIsVerificationOnly] = useState(false);
  const [showSalesNavModal, setShowSalesNavModal] = useState(false);
  const router = useRouter();

  const handleMappingChange = useCallback((mapping: ColumnMapping, isValid: boolean) => {
    setColumnMapping(mapping);
    setIsMappingValid(isValid);
  }, []);

  const handleUpload = async () => {
    if (!selectedFile || !isMappingValid || !columnMapping) {
      setError("Please map all required columns before uploading");
      return;
    }

    if (selectedFile.size > 10 * 1024 * 1024) {
      setError("File size must be less than 10MB");
      return;
    }

    setUploading(true);
    setError("");

    try {
      const response = await apiClient.uploadFile(selectedFile, {
        company_size: companySize || undefined,
        column_first_name: columnMapping.first_name,
        column_last_name: columnMapping.last_name,
        column_website: columnMapping.website,
        column_company_size: columnMapping.company_size || undefined,
      });
      router.push(`/dashboard?jobId=${response.job_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleSalesNavStart = async (url: string, autoEnrich: boolean, companySize?: string) => {
    // TODO: Implement SalesNav import
    console.log("SalesNav import:", { url, autoEnrich, companySize });
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Hero Section */}
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
          Upload. Verify. Download. Done.
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-400 mb-6">
          Process up to 250M leads • Results in minutes, not hours
        </p>
        <div className="flex flex-wrap gap-3 justify-center">
          <span className="px-3 py-1 rounded-full text-sm bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
            ⚡ Lightning-fast
          </span>
          <span className="px-3 py-1 rounded-full text-sm bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800">
            💰 10x cheaper
          </span>
          <span className="px-3 py-1 rounded-full text-sm bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
            📈 250M+ capacity
          </span>
        </div>
      </div>

      {/* Upload Options */}
      <div className="mb-6 flex gap-4 justify-center">
        <button
          onClick={() => setShowSalesNavModal(true)}
          className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all shadow-lg"
        >
          📋 Import from SalesNav
        </button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 space-y-6">
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-300 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        <VerificationModeToggle
          isVerificationOnly={isVerificationOnly}
          onToggle={setIsVerificationOnly}
        />

        <DropZone
          onFileSelect={setSelectedFile}
          selectedFile={selectedFile}
        />

        {selectedFile && (
          <>
            <div className="border-t pt-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                File Information
              </h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">File name:</span>
                  <span className="ml-2 font-medium">{selectedFile.name}</span>
                </div>
                <div>
                  <span className="text-gray-500">File size:</span>
                  <span className="ml-2 font-medium">
                    {formatFileSize(selectedFile.size)}
                  </span>
                </div>
              </div>
            </div>

            <FilePreview file={selectedFile} onMappingChange={handleMappingChange} />

            {!isVerificationOnly && (
              <div className="border-t dark:border-gray-700 pt-6">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                  Advanced Options
                </h3>
                <div className="space-y-4">
                  <div>
                    <label
                      htmlFor="company-size"
                      className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                    >
                      Company Size (optional)
                    </label>
                    <select
                      id="company-size"
                      value={companySize}
                      onChange={(e) => setCompanySize(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                    >
                      <option value="">Select company size</option>
                      <option value="1-50">1-50 employees</option>
                      <option value="51-200">51-200 employees</option>
                      <option value="201-500">201-500 employees</option>
                      <option value="500+">500+ employees</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end space-x-4 pt-6 border-t dark:border-gray-700">
              <button
                onClick={() => setSelectedFile(null)}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                disabled={uploading}
              >
                Cancel
              </button>
              <button
                onClick={handleUpload}
                disabled={uploading || !isMappingValid}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                title={!isMappingValid ? "Please map all required columns first" : ""}
              >
                {uploading && <LoadingSpinner size="sm" />}
                <span>{uploading ? "Uploading..." : "Upload & Verify"}</span>
              </button>
            </div>
          </>
        )}
      </div>

      <SalesNavModal
        isOpen={showSalesNavModal}
        onClose={() => setShowSalesNavModal(false)}
        onStart={handleSalesNavStart}
      />
    </div>
  );
}

