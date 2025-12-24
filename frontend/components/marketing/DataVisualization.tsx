"use client";

export function DataVisualization() {
  return (
    <div className="relative w-full max-w-2xl mx-auto lg:mx-0">
      <svg
        viewBox="0 0 500 320"
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
              stroke="rgba(0, 153, 255, 0.05)"
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

          {/* Arrow marker */}
          <marker
            id="arrowhead"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill="#0099FF" />
          </marker>
        </defs>

        <rect width="500" height="320" fill="url(#grid)" />

        {/* Stage 1: Your ICP (Input) */}
        <g filter="url(#glow)">
          <rect
            x="20"
            y="125"
            width="70"
            height="70"
            fill="#161A1F"
            stroke="#0099FF"
            strokeWidth="1.5"
            rx="4"
          />
          <text x="55" y="155" fill="#0099FF" fontSize="9" fontFamily="monospace" textAnchor="middle">
            YOUR
          </text>
          <text x="55" y="168" fill="#0099FF" fontSize="9" fontFamily="monospace" textAnchor="middle">
            ICP
          </text>
          <circle cx="55" cy="185" r="3" fill="#0099FF" opacity="0.6">
            <animate
              attributeName="opacity"
              values="0.6;1;0.6"
              dur="2s"
              repeatCount="indefinite"
            />
          </circle>
        </g>

        {/* Connector 1→2 */}
        <path
          d="M 90 160 L 115 160"
          stroke="#0099FF"
          strokeWidth="2"
          markerEnd="url(#arrowhead)"
          strokeDasharray="4,4"
          opacity="0.6"
        >
          <animate
            attributeName="stroke-dashoffset"
            values="8;0"
            dur="1s"
            repeatCount="indefinite"
          />
        </path>

        {/* Stage 2: Scraping Engine */}
        <g filter="url(#glow)">
          <rect
            x="125"
            y="125"
            width="70"
            height="70"
            fill="#161A1F"
            stroke="#0099FF"
            strokeWidth="1.5"
            rx="4"
          />
          <text x="160" y="150" fill="#F0F4F8" fontSize="8" fontFamily="monospace" textAnchor="middle">
            SCRAPING
          </text>
          <text x="160" y="162" fill="#F0F4F8" fontSize="8" fontFamily="monospace" textAnchor="middle">
            ENGINE
          </text>
          {/* Animated scanning lines */}
          <line x1="135" y1="175" x2="185" y2="175" stroke="#0099FF" strokeWidth="0.5" opacity="0.4" />
          <line x1="135" y1="182" x2="185" y2="182" stroke="#0099FF" strokeWidth="0.5" opacity="0.4" />
          <rect x="135" y="173" width="20" height="2" fill="#0099FF" opacity="0.8">
            <animate
              attributeName="x"
              values="135;165;135"
              dur="1.5s"
              repeatCount="indefinite"
            />
          </rect>
        </g>

        {/* Connector 2→3 */}
        <path
          d="M 195 160 L 220 160"
          stroke="#0099FF"
          strokeWidth="2"
          markerEnd="url(#arrowhead)"
          strokeDasharray="4,4"
          opacity="0.6"
        >
          <animate
            attributeName="stroke-dashoffset"
            values="8;0"
            dur="1s"
            repeatCount="indefinite"
          />
        </path>

        {/* Stage 3: Enrichment */}
        <g filter="url(#glow)">
          <rect
            x="230"
            y="125"
            width="70"
            height="70"
            fill="#161A1F"
            stroke="#0099FF"
            strokeWidth="1.5"
            rx="4"
          />
          <text x="265" y="150" fill="#F0F4F8" fontSize="8" fontFamily="monospace" textAnchor="middle">
            DATA
          </text>
          <text x="265" y="162" fill="#F0F4F8" fontSize="8" fontFamily="monospace" textAnchor="middle">
            ENRICHMENT
          </text>
          {/* Data enhancement visualization */}
          <circle cx="255" cy="178" r="4" fill="none" stroke="#0099FF" strokeWidth="1" opacity="0.6" />
          <circle cx="265" cy="182" r="5" fill="none" stroke="#0099FF" strokeWidth="1" opacity="0.8" />
          <circle cx="275" cy="178" r="4" fill="none" stroke="#0099FF" strokeWidth="1" opacity="0.6" />
        </g>

        {/* Connector 3→4 */}
        <path
          d="M 300 160 L 325 160"
          stroke="#0099FF"
          strokeWidth="2"
          markerEnd="url(#arrowhead)"
          strokeDasharray="4,4"
          opacity="0.6"
        >
          <animate
            attributeName="stroke-dashoffset"
            values="8;0"
            dur="1s"
            repeatCount="indefinite"
          />
        </path>

        {/* Stage 4: Waterfall Verification */}
        <g filter="url(#glow)">
          <rect
            x="335"
            y="110"
            width="70"
            height="100"
            fill="#161A1F"
            stroke="#0099FF"
            strokeWidth="1.5"
            rx="4"
          />
          <text x="370" y="130" fill="#F0F4F8" fontSize="7" fontFamily="monospace" textAnchor="middle">
            WATERFALL
          </text>
          <text x="370" y="142" fill="#F0F4F8" fontSize="7" fontFamily="monospace" textAnchor="middle">
            VERIFICATION
          </text>
          {/* Multi-layer verification visualization */}
          <rect x="345" y="152" width="50" height="8" fill="#0099FF" opacity="0.3" rx="1" />
          <rect x="345" y="164" width="50" height="8" fill="#0099FF" opacity="0.5" rx="1" />
          <rect x="345" y="176" width="50" height="8" fill="#0099FF" opacity="0.7" rx="1" />
          <rect x="345" y="188" width="50" height="8" fill="#0099FF" opacity="0.9" rx="1" />
          {/* Checkmark animation */}
          <circle cx="380" cy="196" r="3" fill="#34C759" opacity="0">
            <animate
              attributeName="opacity"
              values="0;1;1;0"
              dur="3s"
              repeatCount="indefinite"
            />
          </circle>
        </g>

        {/* Connector 4→5 */}
        <path
          d="M 405 160 L 430 160"
          stroke="#0099FF"
          strokeWidth="2"
          markerEnd="url(#arrowhead)"
          opacity="0.8"
        />

        {/* Stage 5: Your Proprietary Pipeline (Output) */}
        <g filter="url(#glow)">
          <rect
            x="440"
            y="105"
            width="50"
            height="110"
            fill="#0099FF"
            fillOpacity="0.1"
            stroke="#0099FF"
            strokeWidth="2"
            rx="4"
          />
          {/* Output leads */}
          <rect x="448" y="115" width="34" height="18" fill="#161A1F" stroke="#0099FF" strokeWidth="1" rx="2">
            <animate attributeName="opacity" values="0.5;1;0.5" dur="2s" repeatCount="indefinite" />
          </rect>
          <rect x="448" y="140" width="34" height="18" fill="#161A1F" stroke="#0099FF" strokeWidth="1" rx="2">
            <animate attributeName="opacity" values="0.5;1;0.5" dur="2s" begin="0.3s" repeatCount="indefinite" />
          </rect>
          <rect x="448" y="165" width="34" height="18" fill="#161A1F" stroke="#0099FF" strokeWidth="1" rx="2">
            <animate attributeName="opacity" values="0.5;1;0.5" dur="2s" begin="0.6s" repeatCount="indefinite" />
          </rect>
          <rect x="448" y="190" width="34" height="18" fill="#161A1F" stroke="#0099FF" strokeWidth="1" rx="2">
            <animate attributeName="opacity" values="0.5;1;0.5" dur="2s" begin="0.9s" repeatCount="indefinite" />
          </rect>
        </g>

        {/* Labels */}
        <text x="55" y="210" fill="#6B7280" fontSize="8" fontFamily="Inter, sans-serif" textAnchor="middle">
          Input
        </text>
        <text x="160" y="210" fill="#6B7280" fontSize="8" fontFamily="Inter, sans-serif" textAnchor="middle">
          Scrape
        </text>
        <text x="265" y="210" fill="#6B7280" fontSize="8" fontFamily="Inter, sans-serif" textAnchor="middle">
          Enrich
        </text>
        <text x="370" y="225" fill="#6B7280" fontSize="8" fontFamily="Inter, sans-serif" textAnchor="middle">
          Verify
        </text>
        <text x="465" y="230" fill="#F0F4F8" fontSize="8" fontFamily="Inter, sans-serif" textAnchor="middle" fontWeight="bold">
          YOUR
        </text>
        <text x="465" y="242" fill="#F0F4F8" fontSize="8" fontFamily="Inter, sans-serif" textAnchor="middle" fontWeight="bold">
          PIPELINE
        </text>

        {/* Top banner - Dedicated/Exclusive messaging */}
        <rect x="125" y="70" width="250" height="30" fill="#0099FF" fillOpacity="0.1" rx="4" />
        <text x="250" y="90" fill="#0099FF" fontSize="10" fontFamily="monospace" textAnchor="middle" fontWeight="bold">
          DEDICATED • EXCLUSIVE • YOURS
        </text>

        {/* Bottom stat badges */}
        <g>
          <rect x="125" y="260" width="70" height="24" fill="#161A1F" stroke="#0099FF" strokeWidth="0.5" rx="4" />
          <text x="160" y="276" fill="#0099FF" fontSize="9" fontFamily="monospace" textAnchor="middle">
            800M+
          </text>
        </g>
        <g>
          <rect x="215" y="260" width="70" height="24" fill="#161A1F" stroke="#0099FF" strokeWidth="0.5" rx="4" />
          <text x="250" y="276" fill="#0099FF" fontSize="9" fontFamily="monospace" textAnchor="middle">
            98.5%
          </text>
        </g>
        <g>
          <rect x="305" y="260" width="70" height="24" fill="#161A1F" stroke="#0099FF" strokeWidth="0.5" rx="4" />
          <text x="340" y="276" fill="#0099FF" fontSize="9" fontFamily="monospace" textAnchor="middle">
            SAVE 70%
          </text>
        </g>
      </svg>
    </div>
  );
}
