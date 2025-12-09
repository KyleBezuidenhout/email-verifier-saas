"use client";

import { useCallback, useState } from "react";
import { cn } from "@/lib/utils";

interface DropZoneProps {
  onFileSelect: (file: File) => void;
  selectedFile: File | null;
}

export function DropZone({ onFileSelect, selectedFile }: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const file = e.dataTransfer.files[0];
      if (file && file.type === "text/csv") {
        onFileSelect(file);
      }
    },
    [onFileSelect]
  );

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type === "text/csv") {
      onFileSelect(file);
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        "relative border-2 border-dashed rounded-xl p-16 text-center transition-all duration-300 overflow-hidden",
        isDragging
          ? "border-apple-accent bg-apple-surface/50"
          : "border-apple-border bg-apple-surface/30 hover:border-apple-accent/50"
      )}
    >
      {/* Concentric rings background effect */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="absolute w-64 h-64 rounded-full border border-apple-border/20"></div>
        <div className="absolute w-96 h-96 rounded-full border border-apple-border/10"></div>
        <div className="absolute w-[32rem] h-[32rem] rounded-full border border-apple-border/5"></div>
      </div>

      <input
        type="file"
        id="file-upload"
        accept=".csv"
        onChange={handleFileInput}
        className="hidden"
      />
      <label htmlFor="file-upload" className="cursor-pointer relative z-10">
        <div className="space-y-6">
          {/* Document icon with upload button overlay */}
          <div className="mx-auto relative w-20 h-20">
            {/* Document icon */}
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="w-full h-full text-apple-text-muted"
            >
              <rect x="6" y="4" width="12" height="16" rx="2" stroke="currentColor" strokeWidth="2" fill="none"/>
              <line x1="9" y1="8" x2="15" y2="8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <line x1="9" y1="12" x2="15" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <line x1="9" y1="16" x2="13" y2="16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            {/* Upload button overlay */}
            <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-apple-accent rounded-full flex items-center justify-center shadow-lg">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                className="w-5 h-5 text-white"
              >
                <path d="M12 5v14M5 12l7-7 7 7" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </div>
          
          <div className="space-y-2">
            <p className="text-xl font-bold text-apple-text">
              {selectedFile ? selectedFile.name : "Import new file"}
            </p>
            <div className="space-y-1">
              <p className="text-sm text-apple-text-muted">
                Maximum file size: 50 MB (10K records MAX)
              </p>
              <p className="text-sm text-apple-text-muted">
                Supported format:{" "}
                <span className="px-2 py-0.5 bg-apple-surface border border-apple-border rounded-full text-apple-text">
                  .CSV
                </span>
              </p>
            </div>
          </div>
        </div>
      </label>
    </div>
  );
}

