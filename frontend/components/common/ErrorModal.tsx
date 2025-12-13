"use client";

import { useRouter } from "next/navigation";

interface ErrorModalProps {
  isOpen: boolean;
  onClose: () => void;
  message: string;
  title?: string;
}

export function ErrorModal({ isOpen, onClose, message, title }: ErrorModalProps) {
  const router = useRouter();

  if (!isOpen) return null;

  // Check if this is an insufficient credits error
  const isInsufficientCredits = message.toLowerCase().includes("insufficient credits");

  const handlePrimaryAction = () => {
    if (isInsufficientCredits) {
      router.push("/get-credits");
    } else {
      router.push("/support");
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-apple-surface border border-apple-border rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl">
        {/* Error Icon */}
        <div className="flex justify-center mb-6">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
            isInsufficientCredits ? "bg-yellow-500/20" : "bg-red-500/20"
          }`}>
            {isInsufficientCredits ? (
              <svg className="w-8 h-8 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : (
              <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            )}
          </div>
        </div>

        {/* Title */}
        <h2 className="text-xl font-bold text-apple-text text-center mb-3">
          {title || (isInsufficientCredits ? "Insufficient Credits" : "Error")}
        </h2>

        {/* Message */}
        <p className="text-apple-text-muted text-center mb-8 leading-relaxed">
          {message}
        </p>

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-6 py-3 bg-apple-bg border border-apple-border text-apple-text rounded-xl font-medium hover:bg-apple-surface transition-all"
          >
            Close
          </button>
          <button
            onClick={handlePrimaryAction}
            className={`flex-1 px-6 py-3 rounded-xl font-medium transition-all ${
              isInsufficientCredits
                ? "bg-yellow-500 hover:bg-yellow-600 text-black"
                : "bg-apple-accent hover:bg-apple-accent/90 text-white"
            }`}
          >
            {isInsufficientCredits ? "Get More Credits" : "Contact Support"}
          </button>
        </div>
      </div>
    </div>
  );
}

