"use client";

// Placeholder SVG logos as data URIs
const placeholderLogos = [
  {
    name: "Acme Corp",
    // Simple geometric logo - square with diagonal
    src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 40' fill='white'%3E%3Crect x='5' y='5' width='30' height='30' rx='4' stroke='white' stroke-width='2' fill='none'/%3E%3Cpath d='M10 30 L30 10' stroke='white' stroke-width='2'/%3E%3Ctext x='45' y='27' font-family='Arial' font-weight='bold' font-size='16'%3EACME%3C/text%3E%3C/svg%3E",
  },
  {
    name: "Vertex",
    // Triangle logo
    src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 40' fill='white'%3E%3Cpolygon points='20,5 5,35 35,35' stroke='white' stroke-width='2' fill='none'/%3E%3Ctext x='45' y='27' font-family='Arial' font-weight='bold' font-size='14'%3EVERTEX%3C/text%3E%3C/svg%3E",
  },
  {
    name: "Pulse",
    // Circle with wave logo
    src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 40' fill='white'%3E%3Ccircle cx='20' cy='20' r='15' stroke='white' stroke-width='2' fill='none'/%3E%3Cpath d='M10 20 Q15 10 20 20 T30 20' stroke='white' stroke-width='2' fill='none'/%3E%3Ctext x='45' y='27' font-family='Arial' font-weight='bold' font-size='14'%3EPULSE%3C/text%3E%3C/svg%3E",
  },
  {
    name: "Nexus",
    // Hexagon logo
    src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 40' fill='white'%3E%3Cpolygon points='20,3 33,10 33,26 20,33 7,26 7,10' stroke='white' stroke-width='2' fill='none'/%3E%3Ctext x='45' y='27' font-family='Arial' font-weight='bold' font-size='14'%3ENEXUS%3C/text%3E%3C/svg%3E",
  },
];

export function TrustedBy() {
  return (
    <section
      style={{
        backgroundColor: "#000",
        padding: "80px 40px",
      }}
    >
      <div
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
          textAlign: "center",
        }}
      >
        {/* Trust text */}
        <p
          className="trusted-by-text"
          style={{
            color: "#888",
            fontSize: "14px",
            marginBottom: "32px",
            lineHeight: 1.5,
          }}
        >
          Trusted by 112+ teams ranging from YC startups, 43 B2B Sales teams, &
          Award-winning agencies.
        </p>

        {/* Logo container */}
        <div
          className="trusted-by-logos"
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            alignItems: "center",
            gap: "60px",
          }}
        >
          {placeholderLogos.map((logo) => (
            <img
              key={logo.name}
              src={logo.src}
              alt={logo.name}
              className="trusted-by-logo"
              style={{
                height: "50px",
                objectFit: "contain",
                opacity: 0.65,
                filter: "grayscale(100%) brightness(1.15)",
                transition: "all 0.3s ease",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => {
                const target = e.target as HTMLImageElement;
                target.style.opacity = "1";
                target.style.filter = "grayscale(100%) brightness(1.3)";
                target.style.transform = "scale(1.08)";
              }}
              onMouseLeave={(e) => {
                const target = e.target as HTMLImageElement;
                target.style.opacity = "0.65";
                target.style.filter = "grayscale(100%) brightness(1.15)";
                target.style.transform = "scale(1)";
              }}
            />
          ))}
        </div>
      </div>

      {/* Responsive styles */}
      <style jsx>{`
        @media (max-width: 768px) {
          section {
            padding: 60px 30px !important;
          }
          .trusted-by-text {
            font-size: 13px !important;
          }
          .trusted-by-logos {
            gap: 40px !important;
          }
          .trusted-by-logo {
            height: 45px !important;
          }
        }
        @media (max-width: 480px) {
          section {
            padding: 50px 20px !important;
          }
          .trusted-by-text {
            font-size: 12px !important;
          }
          .trusted-by-logos {
            gap: 25px !important;
          }
          .trusted-by-logo {
            height: 40px !important;
          }
        }
      `}</style>
    </section>
  );
}

