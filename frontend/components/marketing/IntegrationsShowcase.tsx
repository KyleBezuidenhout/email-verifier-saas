"use client";

import { useEffect, useState } from "react";

// Integration data with image URLs
const integrations = [
  {
    name: "Clay",
    image: "https://i.ibb.co/5g8S3CKS/clay-logo-transparent.png",
  },
  {
    name: "Salesforce",
    image: "https://i.ibb.co/7JzG4fv9/salesforce-logo-transparent.png",
  },
  {
    name: "LinkedIn",
    image: "https://i.ibb.co/Q3pQFHg7/Linkedin-logo-transparent.png",
  },
  {
    name: "Smartlead",
    image: "https://i.ibb.co/PGnz9qDX/Smartlead-logo-transparent.png",
  },
  {
    name: "Instantly",
    image: "https://i.ibb.co/60PSSXJf/instantly-logo-transparent.png",
  },
  {
    name: "Plusvibe",
    image: "https://i.ibb.co/7JV2m8Bn/plusvibe-logo-transparent.png",
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
      stroke="rgba(0, 163, 255, 0.15)"
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
        <linearGradient id={`beam-gradient-${id}`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#00A3FF" stopOpacity="0">
            <animate
              attributeName="offset"
              values="0;0.3;1"
              dur="2s"
              begin={`${delay}s`}
              repeatCount="indefinite"
            />
          </stop>
          <stop offset="20%" stopColor="#00A3FF" stopOpacity="1">
            <animate
              attributeName="offset"
              values="0.2;0.5;1.2"
              dur="2s"
              begin={`${delay}s`}
              repeatCount="indefinite"
            />
          </stop>
          <stop offset="40%" stopColor="#00A3FF" stopOpacity="0">
            <animate
              attributeName="offset"
              values="0.4;0.7;1.4"
              dur="2s"
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
        strokeWidth="3"
        strokeLinecap="round"
        style={{
          filter: "drop-shadow(0 0 8px rgba(0, 163, 255, 0.8))",
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

  // Icon positions for the 6 integrations
  const iconPositions = [
    { id: 0, className: "top-[60px] left-[120px]" },                              // top-left
    { id: 1, className: "top-[60px] right-[120px]" },                             // top-right
    { id: 2, className: "top-1/2 left-[40px] -translate-y-1/2" },                 // middle-left
    { id: 3, className: "top-1/2 right-[40px] -translate-y-1/2" },                // middle-right
    { id: 4, className: "bottom-[60px] left-[120px]" },                           // bottom-left
    { id: 5, className: "bottom-[60px] right-[120px]" },                          // bottom-right
  ];

  const centerX = 250;
  const centerY = 200;

  return (
    <section className="py-24 lg:py-32 relative overflow-hidden">
      {/* Charcoal black gridded background */}
      <div 
        className="absolute inset-0"
        style={{
          backgroundColor: "#1a1a1e",
          backgroundImage: `
            linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px)
          `,
          backgroundSize: "60px 60px",
        }}
      />
      
      {/* Subtle gradient overlay for depth */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse at center, rgba(30, 30, 36, 0) 0%, rgba(22, 22, 26, 0.8) 100%)",
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
              <linearGradient id="integration-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#0099FF" stopOpacity="0.8" />
                <stop offset="50%" stopColor="#7C3AED" stopOpacity="1" />
                <stop offset="100%" stopColor="#0099FF" stopOpacity="0.8" />
              </linearGradient>
              
              {/* Glow filter */}
              <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                <feMerge>
                  <feMergeNode in="coloredBlur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
            </defs>

            {/* Connection lines from center to each icon */}
            <g filter="url(#glow)">
              <ConnectionLine x1={centerX} y1={centerY} x2={152} y2={92} delay={0} />
              <ConnectionLine x1={centerX} y1={centerY} x2={348} y2={92} delay={0.3} />
              <ConnectionLine x1={centerX} y1={centerY} x2={72} y2={200} delay={0.6} />
              <ConnectionLine x1={centerX} y1={centerY} x2={428} y2={200} delay={0.9} />
              <ConnectionLine x1={centerX} y1={centerY} x2={152} y2={308} delay={1.2} />
              <ConnectionLine x1={centerX} y1={centerY} x2={348} y2={308} delay={1.5} />
            </g>

            {/* Animated dots traveling along lines */}
            <g className="opacity-60">
              <PulsingDot cx={201} cy={146} delay={0.5} />
              <PulsingDot cx={299} cy={146} delay={0.8} />
              <PulsingDot cx={161} cy={200} delay={1.1} />
              <PulsingDot cx={339} cy={200} delay={1.4} />
              <PulsingDot cx={201} cy={254} delay={1.7} />
              <PulsingDot cx={299} cy={254} delay={2.0} />
            </g>
          </svg>

          {/* Center Hub */}
          <div 
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20"
          >
            <div 
              className="relative bg-gradient-to-br from-white to-gray-100 px-6 py-4 rounded-2xl shadow-2xl"
              style={{
                boxShadow: "0 0 60px rgba(0, 153, 255, 0.4), 0 0 100px rgba(124, 58, 237, 0.2)",
              }}
            >
              {/* Animated ring */}
              <div 
                className="absolute -inset-2 rounded-3xl opacity-50 animate-pulse"
                style={{
                  background: "linear-gradient(135deg, rgba(0, 153, 255, 0.3), rgba(124, 58, 237, 0.3))",
                  filter: "blur(8px)",
                }}
              />
              
              <div className="relative">
                <span className="block text-base font-bold text-gray-900 tracking-wide leading-tight text-center">
                  Billion<br/>Verifier
                </span>
              </div>
            </div>
          </div>

          {/* Integration Icons */}
          {integrations.map((integration, index) => (
            <div
              key={integration.name}
              className={`absolute z-10 w-16 h-16 ${iconPositions[index].className}`}
              style={{
                animationDelay: `${index * 0.1}s`,
              }}
            >
              <div 
                className="group relative w-full h-full bg-[#1F2937] rounded-2xl flex items-center justify-center transition-all duration-300 hover:scale-110 cursor-pointer overflow-hidden"
                style={{
                  boxShadow: "0 4px 24px rgba(0, 0, 0, 0.6), 0 0 20px rgba(0, 153, 255, 0.1)",
                }}
              >
                {/* Hover glow effect */}
                <div 
                  className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                  style={{
                    boxShadow: "0 0 30px rgba(0, 153, 255, 0.5)",
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
