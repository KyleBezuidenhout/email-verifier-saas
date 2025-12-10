"use client";

import React from "react";

interface SpeedometerProps {
  value: number; // Current rate (0-170)
  max?: number; // Max value (default 170)
  label?: string; // Label below speedometer
}

export function Speedometer({ value, max = 170, label }: SpeedometerProps) {
  // Clamp value between 0 and max
  const clampedValue = Math.min(Math.max(0, value), max);
  
  // Calculate needle rotation (-135deg to +135deg for 270 degree arc)
  const percentage = clampedValue / max;
  const rotation = -135 + (percentage * 270);
  
  // Generate tick marks (every 10 units)
  const ticks = [];
  for (let i = 0; i <= max; i += 10) {
    const tickPercentage = i / max;
    const tickRotation = -135 + (tickPercentage * 270);
    const isMajor = i % 50 === 0;
    ticks.push({ value: i, rotation: tickRotation, isMajor });
  }

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-32 h-20 overflow-hidden">
        {/* Background arc */}
        <svg 
          className="absolute inset-0 w-full h-full"
          viewBox="0 0 120 70"
        >
          {/* Subtle blue backdrop arc */}
          <defs>
            <linearGradient id="arcGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#007AFF" stopOpacity="0.1" />
              <stop offset="50%" stopColor="#007AFF" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#007AFF" stopOpacity="0.1" />
            </linearGradient>
          </defs>
          
          {/* Background arc */}
          <path
            d="M 15 60 A 45 45 0 0 1 105 60"
            fill="none"
            stroke="url(#arcGradient)"
            strokeWidth="12"
            strokeLinecap="round"
          />
          
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
            
            return (
              <g key={index}>
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={tick.isMajor ? "#007AFF" : "#007AFF80"}
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
          <g transform={`rotate(${rotation}, 60, 60)`}>
            {/* Needle shadow */}
            <line
              x1="60"
              y1="60"
              x2="60"
              y2="22"
              stroke="#007AFF40"
              strokeWidth="4"
              strokeLinecap="round"
            />
            {/* Main needle - bright blue */}
            <line
              x1="60"
              y1="60"
              x2="60"
              y2="24"
              stroke="#007AFF"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            {/* Needle tip glow */}
            <circle cx="60" cy="24" r="2" fill="#007AFF" />
          </g>
          
          {/* Center pivot */}
          <circle cx="60" cy="60" r="5" fill="#1C1C1E" stroke="#007AFF" strokeWidth="2" />
          <circle cx="60" cy="60" r="2" fill="#007AFF" />
        </svg>
      </div>
      
      {/* Value display */}
      <div className="text-center -mt-1">
        <span className="text-xl font-bold text-[#007AFF]">{Math.round(clampedValue)}</span>
        <span className="text-xs text-apple-text-muted ml-1">req/s</span>
      </div>
      
      {/* Optional label */}
      {label && (
        <p className="text-xs text-apple-text-muted mt-1">{label}</p>
      )}
    </div>
  );
}

