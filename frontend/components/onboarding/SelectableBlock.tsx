"use client";

interface SelectableBlockProps {
  label: string;
  selected: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
}

export function SelectableBlock({ label, selected, onClick, icon }: SelectableBlockProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        w-full px-4 py-3 rounded-xl border text-left text-sm font-medium
        transition-all duration-200 cursor-pointer
        ${selected
          ? "border-[#0099FF] bg-[#0099FF]/10 text-white"
          : "border-white/10 bg-white/5 text-gray-300 hover:bg-white/10 hover:border-white/20"
        }
      `}
    >
      <span className="flex items-center gap-3">
        {icon && <span className="text-lg">{icon}</span>}
        <span>{label}</span>
        {selected && (
          <svg className="w-4 h-4 text-[#0099FF] ml-auto flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </span>
    </button>
  );
}
