"use client";

import React from "react";

interface SpeedometerProps {
  value: number; // Current rate (0-170)
  max?: number; // Max value (default 170)
  label?: string; // Label below speedometer
  isActive?: boolean; // Whether this key is actively being used
}

export function Speedometer({ value, max = 170, label, isActive = false }: SpeedometerProps) {
  // Force needle to exactly 0 or max based on isActive (ignore intermediate values)
  const needleValue = isActive ? max : 0;
  
  // Calculate needle rotation (-135deg to +135deg for 270 degree arc)
  // 0 = -135deg (pointing bottom-left), max = +135deg (pointing bottom-right)
  const percentage = needleValue / max;
  const rotation = -135 + (percentage * 270);
  
  // Colors based on active state
  const primaryColor = isActive ? "#FF3B30" : "#007AFF"; // Red when active, blue when idle
  const glowColor = isActive ? "#FF3B30" : "#007AFF";
  const glowOpacity = isActive ? "0.6" : "0.4";
  
  // Generate tick marks (every 10 units)
  const ticks = [];
  for (let i = 0; i <= max; i += 10) {
    const tickPercentage = i / max;
    const tickRotation = -135 + (tickPercentage * 270);
    const isMajor = i % 50 === 0;
    ticks.push({ value: i, rotation: tickRotation, isMajor });
  }

  // Unique ID for gradients (to avoid conflicts with multiple speedometers)
  const gradientId = `arcGradient-${label?.replace(/\s/g, '') || 'default'}-${isActive ? 'active' : 'idle'}`;
  const glowFilterId = `needleGlow-${label?.replace(/\s/g, '') || 'default'}`;

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-32 h-20 overflow-hidden">
        {/* Background arc */}
        <svg 
          className="absolute inset-0 w-full h-full"
          viewBox="0 0 120 70"
        >
          <defs>
            {/* Arc gradient */}
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={primaryColor} stopOpacity="0.1" />
              <stop offset="50%" stopColor={primaryColor} stopOpacity="0.2" />
              <stop offset="100%" stopColor={primaryColor} stopOpacity="0.1" />
            </linearGradient>
            
            {/* Glow filter for active needle */}
            {isActive && (
              <filter id={glowFilterId} x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                <feMerge>
                  <feMergeNode in="coloredBlur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
            )}
          </defs>
          
          {/* Background arc */}
          <path
            d="M 15 60 A 45 45 0 0 1 105 60"
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth="12"
            strokeLinecap="round"
          />
          
          {/* Active glow arc when in use */}
          {isActive && (
            <path
              d="M 15 60 A 45 45 0 0 1 105 60"
              fill="none"
              stroke="#FF3B30"
              strokeWidth="12"
              strokeLinecap="round"
              opacity="0.15"
              className="animate-pulse"
            />
          )}
          
          {/* Tick marks */}
          {ticks.map((tick, index) => {
            const rad = (tick.rotation * Math.PI) / 180;
            const innerRadius = tick.isMajor ? 32 : 38;
            const outerRadius = 44;
            const cx = 60;
            const cy = 60;
            
            const x1 = cx + innerRadius * Math.cos(rad);
            const y1 = cy + innerRadius * Math.sin(rad);
            const x2 = cx + outerRadius * Math.cos(rad);
            const y2 = cy + outerRadius * Math.sin(rad);
            
            const tickColor = isActive ? "#FF3B30" : "#007AFF";
            
            return (
              <g key={index}>
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={tick.isMajor ? tickColor : `${tickColor}80`}
                  strokeWidth={tick.isMajor ? 2 : 1}
                />
                {tick.isMajor && tick.value > 0 && tick.value < max && (
                  <text
                    x={cx + 24 * Math.cos(rad)}
                    y={cy + 24 * Math.sin(rad)}
                    fill="#9CA3AF"
                    fontSize="7"
                    textAnchor="middle"
                    dominantBaseline="middle"
                  >
                    {tick.value}
                  </text>
                )}
              </g>
            );
          })}
          
          {/* Min label */}
          <text x="12" y="66" fill="#9CA3AF" fontSize="7" textAnchor="middle">0</text>
          
          {/* Max label */}
          <text x="108" y="66" fill="#9CA3AF" fontSize="7" textAnchor="middle">{max}</text>
          
          {/* Needle */}
          <g 
            transform={`rotate(${rotation}, 60, 60)`}
            filter={isActive ? `url(#${glowFilterId})` : undefined}
          >
            {/* Needle shadow/glow */}
            <line
              x1="60"
              y1="60"
              x2="60"
              y2="22"
              stroke={glowColor}
              strokeOpacity={glowOpacity}
              strokeWidth="4"
              strokeLinecap="round"
            />
            {/* Main needle */}
            <line
              x1="60"
              y1="60"
              x2="60"
              y2="24"
              stroke={primaryColor}
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            {/* Needle tip glow */}
            <circle cx="60" cy="24" r="2" fill={primaryColor} />
            {/* Extra glow when active */}
            {isActive && (
              <circle cx="60" cy="24" r="4" fill={primaryColor} opacity="0.3" className="animate-ping" />
            )}
          </g>
          
          {/* Center pivot */}
          <circle cx="60" cy="60" r="5" fill="#1C1C1E" stroke={primaryColor} strokeWidth="2" />
          <circle cx="60" cy="60" r="2" fill={primaryColor} />
        </svg>
      </div>
      
      {/* Value display */}
      <div className="text-center -mt-1">
        <span className={`text-xl font-bold ${isActive ? 'text-[#FF3B30]' : 'text-[#007AFF]'}`}>
          {needleValue}
        </span>
        <span className="text-xs text-apple-text-muted ml-1">req/30s</span>
      </div>
      
      {/* Status indicator */}
      <div className="flex items-center gap-1.5 mt-1">
        <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-[#FF3B30] animate-pulse' : 'bg-apple-text-muted'}`} />
        <span className={`text-xs ${isActive ? 'text-[#FF3B30]' : 'text-apple-text-muted'}`}>
          {isActive ? 'Active' : 'Idle'}
        </span>
      </div>
      
      {/* Optional label */}
      {label && (
        <p className="text-xs text-apple-text-muted mt-1">{label}</p>
      )}
    </div>
  );
}
