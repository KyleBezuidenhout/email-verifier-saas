"use client";

import { useRef, useState } from "react";

export default function WatchTutorialPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hasPlayed, setHasPlayed] = useState(false);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Tutorial</h1>
        <p className="text-dashboard-text-muted mt-1">
          Learn how to use all the tools available on BillionVerifier
        </p>
      </div>

      <div className="glass-surface p-3 rounded-xl">
        <video
          ref={videoRef}
          controls
          playsInline
          preload="metadata"
          onPlay={() => setHasPlayed(true)}
          className="w-full rounded-lg"
          style={{ aspectRatio: "16 / 9", background: "#000" }}
        >
          <source src="/videos/onboarding-intro.mp4" type="video/mp4" />
          Your browser does not support the video tag.
        </video>
      </div>

      {!hasPlayed && (
        <p className="text-center text-sm text-dashboard-text-muted mt-4">
          Click play to watch the walkthrough
        </p>
      )}
    </div>
  );
}
