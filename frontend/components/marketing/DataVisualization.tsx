"use client";

export function DataVisualization() {
  return (
    <div className="relative w-full max-w-lg mx-auto lg:mx-0">
      <svg
        viewBox="0 0 400 300"
        className="w-full h-auto"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Background grid pattern */}
        <defs>
          <pattern
            id="grid"
            width="20"
            height="20"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 20 0 L 0 0 0 20"
              fill="none"
              stroke="rgba(0, 255, 133, 0.05)"
              strokeWidth="0.5"
            />
          </pattern>
          
          {/* Gradient for flowing lines */}
          <linearGradient id="flowGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#0099FF" stopOpacity="0" />
            <stop offset="50%" stopColor="#0099FF" stopOpacity="1" />
            <stop offset="100%" stopColor="#0099FF" stopOpacity="0" />
          </linearGradient>

          {/* Glow filter */}
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <rect width="400" height="300" fill="url(#grid)" />

        {/* Left side - Chaotic scattered data points */}
        <g className="animate-pulse-node" style={{ animationDelay: "0s" }}>
          <circle cx="40" cy="60" r="4" fill="#6B7280" opacity="0.6" />
          <circle cx="65" cy="45" r="3" fill="#6B7280" opacity="0.4" />
          <circle cx="30" cy="90" r="5" fill="#6B7280" opacity="0.5" />
          <circle cx="80" cy="75" r="3" fill="#6B7280" opacity="0.7" />
          <circle cx="55" cy="110" r="4" fill="#6B7280" opacity="0.4" />
        </g>

        <g className="animate-pulse-node" style={{ animationDelay: "0.3s" }}>
          <circle cx="45" cy="140" r="3" fill="#6B7280" opacity="0.5" />
          <circle cx="70" cy="160" r="4" fill="#6B7280" opacity="0.6" />
          <circle cx="25" cy="175" r="3" fill="#6B7280" opacity="0.4" />
          <circle cx="85" cy="130" r="5" fill="#6B7280" opacity="0.7" />
          <circle cx="50" cy="195" r="4" fill="#6B7280" opacity="0.5" />
        </g>

        <g className="animate-pulse-node" style={{ animationDelay: "0.6s" }}>
          <circle cx="35" cy="220" r="4" fill="#6B7280" opacity="0.6" />
          <circle cx="75" cy="240" r="3" fill="#6B7280" opacity="0.4" />
          <circle cx="55" cy="260" r="5" fill="#6B7280" opacity="0.5" />
          <circle cx="90" cy="210" r="3" fill="#6B7280" opacity="0.7" />
        </g>

        {/* Center - Transformation funnel/processor */}
        <g filter="url(#glow)">
          {/* Main processor box */}
          <rect
            x="140"
            y="100"
            width="80"
            height="100"
            fill="#161A1F"
            stroke="#0099FF"
            strokeWidth="1.5"
          />
          
          {/* Inner processing lines */}
          <line x1="150" y1="120" x2="210" y2="120" stroke="#0099FF" strokeWidth="0.5" opacity="0.5" />
          <line x1="150" y1="140" x2="210" y2="140" stroke="#0099FF" strokeWidth="0.5" opacity="0.5" />
          <line x1="150" y1="160" x2="210" y2="160" stroke="#0099FF" strokeWidth="0.5" opacity="0.5" />
          <line x1="150" y1="180" x2="210" y2="180" stroke="#0099FF" strokeWidth="0.5" opacity="0.5" />
          
          {/* Processing indicator */}
          <circle cx="180" cy="150" r="15" fill="none" stroke="#0099FF" strokeWidth="1" opacity="0.8">
            <animate
              attributeName="r"
              values="12;18;12"
              dur="2s"
              repeatCount="indefinite"
            />
            <animate
              attributeName="opacity"
              values="0.8;0.3;0.8"
              dur="2s"
              repeatCount="indefinite"
            />
          </circle>
          <circle cx="180" cy="150" r="6" fill="#0099FF" opacity="0.9" />
        </g>

        {/* Flowing lines from chaos to processor */}
        <g>
          <path
            d="M 90 70 Q 115 90 140 120"
            stroke="#0099FF"
            strokeWidth="1"
            fill="none"
            strokeDasharray="4,4"
            opacity="0.4"
          >
            <animate
              attributeName="stroke-dashoffset"
              values="8;0"
              dur="1s"
              repeatCount="indefinite"
            />
          </path>
          <path
            d="M 85 150 Q 110 150 140 150"
            stroke="#0099FF"
            strokeWidth="1"
            fill="none"
            strokeDasharray="4,4"
            opacity="0.4"
          >
            <animate
              attributeName="stroke-dashoffset"
              values="8;0"
              dur="1.2s"
              repeatCount="indefinite"
            />
          </path>
          <path
            d="M 90 230 Q 115 200 140 180"
            stroke="#0099FF"
            strokeWidth="1"
            fill="none"
            strokeDasharray="4,4"
            opacity="0.4"
          >
            <animate
              attributeName="stroke-dashoffset"
              values="8;0"
              dur="1.4s"
              repeatCount="indefinite"
            />
          </path>
        </g>

        {/* Right side - Structured output pipeline */}
        <g filter="url(#glow)">
          {/* Main output pipeline */}
          <line
            x1="220"
            y1="150"
            x2="280"
            y2="150"
            stroke="#0099FF"
            strokeWidth="2"
          />
          
          {/* Structured data nodes */}
          <rect
            x="280"
            y="60"
            width="100"
            height="40"
            fill="#161A1F"
            stroke="#0099FF"
            strokeWidth="1"
          />
          <text x="295" y="85" fill="#0099FF" fontSize="10" fontFamily="monospace">
            LEAD_001
          </text>

          <rect
            x="280"
            y="110"
            width="100"
            height="40"
            fill="#161A1F"
            stroke="#0099FF"
            strokeWidth="1"
          />
          <text x="295" y="135" fill="#0099FF" fontSize="10" fontFamily="monospace">
            LEAD_002
          </text>

          <rect
            x="280"
            y="160"
            width="100"
            height="40"
            fill="#161A1F"
            stroke="#0099FF"
            strokeWidth="1"
          />
          <text x="295" y="185" fill="#0099FF" fontSize="10" fontFamily="monospace">
            LEAD_003
          </text>

          <rect
            x="280"
            y="210"
            width="100"
            height="40"
            fill="#161A1F"
            stroke="#0099FF"
            strokeWidth="1"
          />
          <text x="295" y="235" fill="#0099FF" fontSize="10" fontFamily="monospace">
            LEAD_004
          </text>

          {/* Connection lines to structured data */}
          <path
            d="M 280 150 L 260 80 L 280 80"
            stroke="#0099FF"
            strokeWidth="1"
            fill="none"
            opacity="0.6"
          />
          <path
            d="M 280 150 L 265 130 L 280 130"
            stroke="#0099FF"
            strokeWidth="1"
            fill="none"
            opacity="0.6"
          />
          <path
            d="M 280 150 L 265 180 L 280 180"
            stroke="#0099FF"
            strokeWidth="1"
            fill="none"
            opacity="0.6"
          />
          <path
            d="M 280 150 L 260 230 L 280 230"
            stroke="#0099FF"
            strokeWidth="1"
            fill="none"
            opacity="0.6"
          />
        </g>

        {/* Ownership badge */}
        <g>
          <rect
            x="300"
            y="265"
            width="80"
            height="24"
            fill="#0099FF"
            opacity="0.15"
          />
          <text x="310" y="281" fill="#0099FF" fontSize="9" fontFamily="monospace" fontWeight="bold">
            YOUR DATA
          </text>
        </g>

        {/* Labels */}
        <text x="40" y="285" fill="#6B7280" fontSize="10" fontFamily="Inter, sans-serif">
          Shared Pool
        </text>
        <text x="155" y="220" fill="#0099FF" fontSize="10" fontFamily="Inter, sans-serif">
          Engine
        </text>
        <text x="295" y="50" fill="#F0F4F8" fontSize="10" fontFamily="Inter, sans-serif">
          Proprietary Pipeline
        </text>
      </svg>
    </div>
  );
}

