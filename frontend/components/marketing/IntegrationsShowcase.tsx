"use client";

import { useEffect, useState } from "react";

// Integration data with image URLs and positions
const integrations = [
  {
    name: "Clay",
    image: "https://i.ibb.co/5g8S3CKS/clay-logo-transparent.png",
    // Top-left position
    style: { top: "10%", left: "20%" },
    svgPos: { x: 100, y: 50 },
  },
  {
    name: "Salesforce",
    image: "https://i.ibb.co/7JzG4fv9/salesforce-logo-transparent.png",
    // Top-right position
    style: { top: "10%", right: "20%" },
    svgPos: { x: 400, y: 50 },
  },
  {
    name: "LinkedIn",
    image: "https://i.ibb.co/Q3pQFHg7/Linkedin-logo-transparent.png",
    // Middle-left position
    style: { top: "50%", left: "5%", transform: "translateY(-50%)" },
    svgPos: { x: 40, y: 200 },
  },
  {
    name: "Smartlead",
    image: "https://i.ibb.co/PGnz9qDX/Smartlead-logo-transparent.png",
    // Middle-right position
    style: { top: "50%", right: "5%", transform: "translateY(-50%)" },
    svgPos: { x: 460, y: 200 },
  },
  {
    name: "Instantly",
    image: "https://i.ibb.co/60PSSXJf/instantly-logo-transparent.png",
    // Bottom-left position
    style: { bottom: "10%", left: "20%" },
    svgPos: { x: 100, y: 350 },
  },
  {
    name: "Plusvibe",
    image: "https://i.ibb.co/7JV2m8Bn/plusvibe-logo-transparent.png",
    // Bottom-right position
    style: { bottom: "10%", right: "20%" },
    svgPos: { x: 400, y: 350 },
  },
];

// Calculate perpendicular offset for parallel lines
function getPerpendicularOffset(x1: number, y1: number, x2: number, y2: number, offset: number) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.sqrt(dx * dx + dy * dy);
  // Perpendicular unit vector
  const px = -dy / length;
  const py = dx / length;
  return { px: px * offset, py: py * offset };
}

// Dual parallel connection lines (base lines)
function ConnectionLines({ 
  x1, y1, x2, y2, offset = 5 
}: { 
  x1: number; y1: number; x2: number; y2: number; offset?: number;
}) {
  const { px, py } = getPerpendicularOffset(x1, y1, x2, y2, offset);
  
  return (
    <>
      {/* First line (offset negative) */}
      <line
        x1={x1 - px}
        y1={y1 - py}
        x2={x2 - px}
        y2={y2 - py}
        stroke="rgba(0, 163, 255, 0.25)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Second line (offset positive) */}
      <line
        x1={x1 + px}
        y1={y1 + py}
        x2={x2 + px}
        y2={y2 + py}
        stroke="rgba(0, 163, 255, 0.25)"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </>
  );
}

// Animated energy beam shooting outward from center (runs between the two parallel lines)
function EnergyBeam({ 
  x1, y1, x2, y2, delay = 0, id, lineOffset = 5 
}: { 
  x1: number; y1: number; x2: number; y2: number; delay?: number; id: string; lineOffset?: number;
}) {
  // The beam runs centered between the two lines, so no perpendicular offset needed
  // But we'll make the beam width fit nicely between the rails
  const beamWidth = lineOffset * 1.5; // Beam fills the gap between the two lines
  
  return (
    <>
      <defs>
        <linearGradient 
          id={`beam-gradient-${id}`} 
          gradientUnits="userSpaceOnUse"
          x1={x1} 
          y1={y1} 
          x2={x2} 
          y2={y2}
        >
          <stop offset="0%" stopColor="#00A3FF" stopOpacity="0">
            <animate
              attributeName="offset"
              values="-0.3;0.7;1.3"
              dur="3s"
              begin={`${delay}s`}
              repeatCount="indefinite"
            />
          </stop>
          <stop offset="15%" stopColor="#00A3FF" stopOpacity="1">
            <animate
              attributeName="offset"
              values="-0.15;0.85;1.45"
              dur="3s"
              begin={`${delay}s`}
              repeatCount="indefinite"
            />
          </stop>
          <stop offset="30%" stopColor="#00A3FF" stopOpacity="0">
            <animate
              attributeName="offset"
              values="0;1;1.6"
              dur="3s"
              begin={`${delay}s`}
              repeatCount="indefinite"
            />
          </stop>
        </linearGradient>
      </defs>
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={`url(#beam-gradient-${id})`}
        strokeWidth={beamWidth}
        strokeLinecap="round"
        style={{
          filter: "drop-shadow(0 0 10px rgba(0, 163, 255, 1))",
        }}
      />
    </>
  );
}

export function IntegrationsShowcase() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const centerX = 250;
  const centerY = 200;

  return (
    <section className="py-24 lg:py-32 relative overflow-hidden">
      {/* Pitch black gridded background */}
      <div 
        className="absolute inset-0"
        style={{
          backgroundColor: "#000000",
          backgroundImage: `
            linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px)
          `,
          backgroundSize: "60px 60px",
        }}
      />
      
      {/* Subtle gradient overlay for depth */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse at center, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.9) 100%)",
        }}
      />
      
      {/* Radial glow behind diagram */}
      <div 
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(0, 153, 255, 0.06) 0%, transparent 70%)",
        }}
      />

      <div className="relative max-w-6xl mx-auto px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-16 lg:mb-20 animate-fade-in">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-landing-heading leading-[1.1] tracking-tight mb-6">
            Single-Step <span className="text-landing-accent">Integration</span>
          </h2>
          <p className="text-lg md:text-xl text-landing-muted max-w-2xl mx-auto leading-relaxed">
            Seamlessly integrate With All Your Favorite Tools
          </p>
        </div>

        {/* Hub and Spoke Diagram */}
        <div 
          className={`relative w-full max-w-[500px] h-[400px] mx-auto transition-all duration-1000 ${
            mounted ? "opacity-100 scale-100" : "opacity-0 scale-95"
          }`}
        >
          {/* SVG Connection Lines */}
          <svg 
            className="absolute inset-0 w-full h-full pointer-events-none" 
            viewBox="0 0 500 400"
            preserveAspectRatio="xMidYMid meet"
          >
            <defs>
              {/* Glow filter */}
              <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                <feMerge>
                  <feMergeNode in="coloredBlur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
            </defs>

            {/* Base connection lines (dual parallel lines) - all 6 branches */}
            <g>
              {integrations.map((integration, index) => (
                <ConnectionLines 
                  key={`lines-${index}`}
                  x1={centerX} 
                  y1={centerY} 
                  x2={integration.svgPos.x} 
                  y2={integration.svgPos.y}
                  offset={5}
                />
              ))}
            </g>

            {/* Animated energy beams shooting outward (between the parallel lines) - all 6 branches */}
            <g>
              {integrations.map((integration, index) => (
                <EnergyBeam 
                  key={`beam-${index}`}
                  x1={centerX} 
                  y1={centerY} 
                  x2={integration.svgPos.x} 
                  y2={integration.svgPos.y} 
                  delay={index * 0.25} 
                  id={`beam${index}`}
                  lineOffset={5}
                />
              ))}
            </g>
          </svg>

          {/* Center Hub - Card */}
          <div 
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20"
          >
            {/* Main card */}
            <div 
              className="relative bg-black px-10 py-6 rounded-2xl shadow-2xl border border-[#00A3FF]/30"
              style={{
                boxShadow: "0 4px 30px rgba(0, 0, 0, 0.5), 0 0 60px rgba(0, 163, 255, 0.3)",
              }}
            >
              {/* Subtle inner border glow */}
              <div 
                className="absolute inset-0 rounded-2xl"
                style={{
                  background: "linear-gradient(135deg, rgba(0, 163, 255, 0.1) 0%, rgba(0, 0, 0, 0) 50%, rgba(0, 163, 255, 0.05) 100%)",
                }}
              />
              
              <div className="relative">
                <span className="block text-xl font-bold text-[#00A3FF] tracking-wide leading-tight text-center">
                  BillionVerifier
                </span>
              </div>
            </div>
          </div>

          {/* Integration Icons - all 6 positioned to match SVG branches */}
          {integrations.map((integration, index) => (
            <div
              key={integration.name}
              className="absolute z-10 w-16 h-16"
              style={{
                ...integration.style,
                animationDelay: `${index * 0.1}s`,
              }}
            >
              <div 
                className="group relative w-full h-full bg-[#1F2937] rounded-2xl flex items-center justify-center transition-all duration-300 hover:scale-110 cursor-pointer overflow-hidden"
                style={{
                  boxShadow: "0 4px 24px rgba(0, 0, 0, 0.6), 0 0 20px rgba(0, 163, 255, 0.15)",
                }}
              >
                {/* Connection point glow */}
                <div 
                  className="absolute inset-0 rounded-2xl"
                  style={{
                    boxShadow: "inset 0 0 15px rgba(0, 163, 255, 0.1)",
                  }}
                />
                
                {/* Hover glow effect */}
                <div 
                  className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                  style={{
                    boxShadow: "0 0 30px rgba(0, 163, 255, 0.6)",
                  }}
                />
                
                {/* Logo Image */}
                <img 
                  src={integration.image} 
                  alt={integration.name}
                  className="relative w-10 h-10 object-contain transform group-hover:scale-110 transition-transform duration-300"
                />

                {/* Tooltip */}
                <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-all duration-300 pointer-events-none">
                  <div className="bg-landing-surface px-3 py-1.5 rounded-lg border border-landing-border whitespace-nowrap">
                    <span className="text-sm font-medium text-landing-heading">{integration.name}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}
