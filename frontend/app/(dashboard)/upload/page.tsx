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
        <h1 className="text-4xl font-bold text-omni-white mb-4">
          Upload. Verify. Download. Done.
        </h1>
        <p className="text-lg text-omni-gray mb-6">
          Process up to 250M leads • Results in minutes, not hours
        </p>
        <div className="flex flex-wrap gap-3 justify-center">
          <span className="px-3 py-1 rounded-full text-sm bg-omni-dark border border-omni-border text-omni-cyan">
            ⚡ Lightning-fast
          </span>
          <span className="px-3 py-1 rounded-full text-sm bg-omni-dark border border-omni-border text-omni-cyan">
            💰 10x cheaper
          </span>
          <span className="px-3 py-1 rounded-full text-sm bg-omni-dark border border-omni-border text-omni-cyan">
            📈 250M+ capacity
          </span>
        </div>
      </div>

      {/* Upload Options */}
      <div className="mb-6 flex gap-4 justify-center">
        <button
          onClick={() => setShowSalesNavModal(true)}
          className="px-6 py-3 bg-omni-cyan text-omni-black rounded-lg hover:opacity-90 transition-opacity font-medium"
        >
          📋 Import from SalesNav
        </button>
      </div>

      <div className="bg-omni-dark border border-omni-border rounded-lg p-6 space-y-6">
        {error && (
          <div className="bg-red-900/20 border border-red-800 text-red-300 px-4 py-3 rounded-lg text-sm">
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
            <div className="border-t border-omni-border pt-6">
              <h3 className="text-lg font-medium text-omni-white mb-4">
                File Information
              </h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-omni-gray">File name:</span>
                  <span className="ml-2 font-medium text-omni-white">{selectedFile.name}</span>
                </div>
                <div>
                  <span className="text-omni-gray">File size:</span>
                  <span className="ml-2 font-medium text-omni-white">
                    {formatFileSize(selectedFile.size)}
                  </span>
                </div>
              </div>
            </div>

            <FilePreview file={selectedFile} onMappingChange={handleMappingChange} />

            {!isVerificationOnly && (
              <div className="border-t border-omni-border pt-6">
                <h3 className="text-lg font-medium text-omni-white mb-4">
                  Advanced Options
                </h3>
                <div className="space-y-4">
                  <div>
                    <label
                      htmlFor="company-size"
                      className="block text-sm font-medium text-omni-gray mb-2"
                    >
                      Company Size (optional)
                    </label>
                    <select
                      id="company-size"
                      value={companySize}
                      onChange={(e) => setCompanySize(e.target.value)}
                      className="w-full px-4 py-2 border border-omni-border rounded-lg focus:ring-2 focus:ring-omni-cyan focus:border-omni-cyan bg-omni-black text-omni-white"
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

            <div className="flex justify-end space-x-4 pt-6 border-t border-omni-border">
              <button
                onClick={() => setSelectedFile(null)}
                className="px-4 py-2 border border-omni-border rounded-lg text-omni-gray hover:bg-omni-dark transition-colors"
                disabled={uploading}
              >
                Cancel
              </button>
              <button
                onClick={handleUpload}
                disabled={uploading || !isMappingValid}
                className="px-6 py-2 bg-omni-cyan text-omni-black rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2 font-medium transition-opacity"
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

