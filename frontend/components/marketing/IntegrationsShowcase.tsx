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

// Static connection line (base line)
function ConnectionLine({ 
  x1, y1, x2, y2 
}: { 
  x1: number; y1: number; x2: number; y2: number;
}) {
  return (
    <line
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      stroke="rgba(0, 163, 255, 0.25)"
      strokeWidth="2"
      strokeLinecap="round"
    />
  );
}

// Animated energy beam shooting outward from center
function EnergyBeam({ 
  x1, y1, x2, y2, delay = 0, id 
}: { 
  x1: number; y1: number; x2: number; y2: number; delay?: number; id: string;
}) {
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
              dur="1.5s"
              begin={`${delay}s`}
              repeatCount="indefinite"
            />
          </stop>
          <stop offset="15%" stopColor="#00A3FF" stopOpacity="1">
            <animate
              attributeName="offset"
              values="-0.15;0.85;1.45"
              dur="1.5s"
              begin={`${delay}s`}
              repeatCount="indefinite"
            />
          </stop>
          <stop offset="30%" stopColor="#00A3FF" stopOpacity="0">
            <animate
              attributeName="offset"
              values="0;1;1.6"
              dur="1.5s"
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
        strokeWidth="4"
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
            Connect <span className="text-landing-accent">BillionVerifier</span> with Your Entire Stack
          </h2>
          <p className="text-lg md:text-xl text-landing-muted max-w-2xl mx-auto leading-relaxed">
            Seamlessly integrate our powerful email verification service with the tools you already use to ensure a clean and effective email list.
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

            {/* Base connection lines (subtle) - all 6 branches */}
            <g>
              {integrations.map((integration, index) => (
                <ConnectionLine 
                  key={`line-${index}`}
                  x1={centerX} 
                  y1={centerY} 
                  x2={integration.svgPos.x} 
                  y2={integration.svgPos.y} 
                />
              ))}
            </g>

            {/* Animated energy beams shooting outward - all 6 branches */}
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
                />
              ))}
            </g>
          </svg>

          {/* Center Hub - Card with glowing blue lines */}
          <div 
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20"
          >
            {/* Glowing diagonal lines shooting from corners */}
            <div className="absolute inset-0 pointer-events-none">
              {/* Top-left diagonal line */}
              <div 
                className="absolute -top-16 -left-16 w-24 h-[2px] origin-right"
                style={{
                  background: "linear-gradient(90deg, rgba(0, 163, 255, 0) 0%, rgba(0, 163, 255, 0.8) 100%)",
                  transform: "rotate(-45deg)",
                  filter: "drop-shadow(0 0 6px rgba(0, 163, 255, 0.8))",
                }}
              />
              {/* Top-right diagonal line */}
              <div 
                className="absolute -top-16 -right-16 w-24 h-[2px] origin-left"
                style={{
                  background: "linear-gradient(90deg, rgba(0, 163, 255, 0.8) 0%, rgba(0, 163, 255, 0) 100%)",
                  transform: "rotate(45deg)",
                  filter: "drop-shadow(0 0 6px rgba(0, 163, 255, 0.8))",
                }}
              />
              {/* Bottom-left diagonal line */}
              <div 
                className="absolute -bottom-16 -left-16 w-24 h-[2px] origin-right"
                style={{
                  background: "linear-gradient(90deg, rgba(0, 163, 255, 0) 0%, rgba(0, 163, 255, 0.8) 100%)",
                  transform: "rotate(45deg)",
                  filter: "drop-shadow(0 0 6px rgba(0, 163, 255, 0.8))",
                }}
              />
              {/* Bottom-right diagonal line */}
              <div 
                className="absolute -bottom-16 -right-16 w-24 h-[2px] origin-left"
                style={{
                  background: "linear-gradient(90deg, rgba(0, 163, 255, 0.8) 0%, rgba(0, 163, 255, 0) 100%)",
                  transform: "rotate(-45deg)",
                  filter: "drop-shadow(0 0 6px rgba(0, 163, 255, 0.8))",
                }}
              />
            </div>
            
            {/* Main card */}
            <div 
              className="relative bg-gradient-to-br from-gray-100 to-gray-200 px-10 py-6 rounded-2xl shadow-2xl"
              style={{
                boxShadow: "0 4px 30px rgba(0, 0, 0, 0.3), 0 0 60px rgba(0, 163, 255, 0.2)",
              }}
            >
              {/* Subtle inner border glow */}
              <div 
                className="absolute inset-0 rounded-2xl"
                style={{
                  background: "linear-gradient(135deg, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0) 50%, rgba(0,0,0,0.05) 100%)",
                }}
              />
              
              <div className="relative">
                <span className="block text-xl font-bold text-gray-900 tracking-wide leading-tight text-center">
                  Billion<br/>Verifier
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
