"use client";

interface VerificationModeToggleProps {
  isVerificationOnly: boolean;
  onToggle: (value: boolean) => void;
}

export function VerificationModeToggle({ isVerificationOnly, onToggle }: VerificationModeToggleProps) {
  return (
    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <label className="flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={isVerificationOnly}
              onChange={(e) => onToggle(e.target.checked)}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <span className="ml-3 text-sm font-medium text-gray-900 dark:text-white">
              Verification Only Mode
            </span>
          </label>
          <p className="mt-1 ml-7 text-xs text-gray-600 dark:text-gray-400">
            {isVerificationOnly
              ? "You already have emails. We'll verify them against our database."
              : "Generate email permutations and verify them."}
          </p>
        </div>
      </div>
    </div>
  );
}


