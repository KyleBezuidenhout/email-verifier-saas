"use client";

import { useEffect, useRef, useState } from "react";

type Signal = {
  name: string;
  action: string;
};

const SIGNALS: Signal[] = [
  { name: "Jordan Mills", action: "Liked Instantly's latest post" },
  { name: "Alex Turner", action: "Shared a post about sender reputation" },
  { name: "Tom Harley", action: "Clicked on ZoomInfo's ad" },
  { name: "James Park", action: "Viewed your profile yesterday" },
  { name: "Jordan Lee", action: "Posted in Sales Automation community" },
  { name: "Rachel Kim", action: "Commented on an email deliverability post" },
  { name: "Marco Reyes", action: "Joined Sales Cadence community" },
];

// Each slot anchors a popup so its avatar sits inside the globe. The avatar
// is ALWAYS on the popup's left side and text flows rightward.
//
// Left-anchored slots set `left:X%` → popup's left edge (avatar) at X%.
// Right-anchored slots set `right:X%` → popup's right edge at (100-X)%, so
// the avatar lands further inward since text pushes the popup leftward.
// Both styles keep the avatar inside the globe while ensuring the text never
// runs past the container edge (which would get clipped by overflow-hidden).
//
// Slots sit on distinct vertical bands so two simultaneously-visible popups
// never collide.
type Slot = {
  top?: string;
  bottom?: string;
  left?: string;
  right?: string;
};

// Horizontal values are tuned so the avatar always lands INSIDE the globe
// circle (globe is inscribed in the container; its corners are outside it).
// Left-anchored avatars need left% >= 22% to stay inside the globe.
const SLOTS: Slot[] = [
  // Top of globe, biased left-of-center
  { top: "16%", left: "32%" },
  // Upper-right interior
  { top: "30%", right: "8%" },
  // Mid-left interior
  { top: "46%", left: "22%" },
  // Mid-right interior
  { top: "58%", right: "10%" },
  // Lower-left interior
  { top: "72%", left: "26%" },
  // Bottom of globe, right-biased interior
  { top: "84%", right: "14%" },
];

const POPUP_LIFETIME_MS = 8000;
const ROTATE_INTERVAL_MS = 4000; // one popup rotates per tick; 2 visible => each lives ~8s
const SEED_STAGGER_MS = 4000;
const ENTER_MS = 500;
const EXIT_MS = 500;
const MAX_VISIBLE = 2;

type ActivePopup = {
  key: number;
  signalIdx: number;
  slotIdx: number;
  exiting: boolean;
  createdAt: number;
};

function pickRandomIndex(total: number, exclude: Set<number>): number | null {
  const available: number[] = [];
  for (let i = 0; i < total; i++) if (!exclude.has(i)) available.push(i);
  if (available.length === 0) return null;
  return available[Math.floor(Math.random() * available.length)];
}

export default function SignalPopups() {
  const [popups, setPopups] = useState<ActivePopup[]>([]);
  const popupsRef = useRef<ActivePopup[]>([]);
  const keyRef = useRef(0);
  // Track slot/signal indices of the most recently exited popup so the
  // next new popup avoids reusing them immediately.
  const recentlyUsedSlot = useRef<number | null>(null);
  const recentlyUsedSignal = useRef<number | null>(null);

  useEffect(() => {
    popupsRef.current = popups;
  }, [popups]);

  useEffect(() => {
    const timers = new Set<ReturnType<typeof setTimeout>>();
    let stopped = false;

    const schedule = (fn: () => void, ms: number) => {
      const t = setTimeout(() => {
        timers.delete(t);
        if (!stopped) fn();
      }, ms);
      timers.add(t);
    };

    const addPopup = () => {
      const current = popupsRef.current;
      const usedSignals = new Set(current.map((p) => p.signalIdx));
      const usedSlots = new Set(current.map((p) => p.slotIdx));
      if (recentlyUsedSlot.current !== null) {
        usedSlots.add(recentlyUsedSlot.current);
      }
      if (recentlyUsedSignal.current !== null) {
        usedSignals.add(recentlyUsedSignal.current);
      }
      let slotIdx = pickRandomIndex(SLOTS.length, usedSlots);
      if (slotIdx === null && recentlyUsedSlot.current !== null) {
        usedSlots.delete(recentlyUsedSlot.current);
        slotIdx = pickRandomIndex(SLOTS.length, usedSlots);
      }
      let signalIdx = pickRandomIndex(SIGNALS.length, usedSignals);
      if (signalIdx === null && recentlyUsedSignal.current !== null) {
        usedSignals.delete(recentlyUsedSignal.current);
        signalIdx = pickRandomIndex(SIGNALS.length, usedSignals);
      }
      if (signalIdx === null || slotIdx === null) return;

      const newPopup: ActivePopup = {
        key: ++keyRef.current,
        signalIdx,
        slotIdx,
        exiting: false,
        createdAt: Date.now(),
      };
      popupsRef.current = [...current, newPopup];
      setPopups(popupsRef.current);
    };

    const markOldestExiting = () => {
      const current = popupsRef.current;
      const living = current.filter((p) => !p.exiting);
      if (living.length === 0) return;
      const oldest = living.reduce((a, b) =>
        a.createdAt <= b.createdAt ? a : b
      );
      recentlyUsedSlot.current = oldest.slotIdx;
      recentlyUsedSignal.current = oldest.signalIdx;
      popupsRef.current = current.map((p) =>
        p.key === oldest.key ? { ...p, exiting: true } : p
      );
      setPopups(popupsRef.current);
    };

    const cleanupExited = () => {
      popupsRef.current = popupsRef.current.filter((p) => !p.exiting);
      setPopups(popupsRef.current);
    };

    // Seed: stagger the first two so they don't rotate out together.
    addPopup();
    schedule(addPopup, SEED_STAGGER_MS);

    const interval = setInterval(() => {
      const living = popupsRef.current.filter((p) => !p.exiting);

      if (living.length < MAX_VISIBLE) {
        addPopup();
        return;
      }

      // At capacity: rotate one out, add its replacement after it fully exits.
      // Only ONE popup rotates per tick; the other survives another cycle,
      // preserving the staggered "one-after-the-other" pattern.
      markOldestExiting();
      schedule(cleanupExited, EXIT_MS + 20);
      schedule(addPopup, EXIT_MS + 40);
    }, ROTATE_INTERVAL_MS);

    return () => {
      stopped = true;
      clearInterval(interval);
      timers.forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  void POPUP_LIFETIME_MS;

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      {popups.map((p) => {
        const slot = SLOTS[p.slotIdx];
        const signal = SIGNALS[p.signalIdx];
        return (
          <div
            key={p.key}
            className={`signal-popup absolute ${p.exiting ? "is-exiting" : ""}`}
            style={{
              top: slot.top,
              bottom: slot.bottom,
              left: slot.left,
              right: slot.right,
            }}
          >
            <div className="flex items-center gap-1.5 rounded-full border border-white/[0.1] bg-black/70 backdrop-blur-md py-1 pl-1 pr-2.5 shadow-[0_6px_18px_rgba(0,0,0,0.5)]">
              <div className="flex items-center justify-center w-5 h-5 rounded-full bg-white/[0.08] border border-white/[0.12] shrink-0">
                <svg
                  className="w-2.5 h-2.5 text-zinc-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                  />
                </svg>
              </div>
              <span className="text-[11px] leading-tight text-white/80 whitespace-nowrap">
                {signal.action}
              </span>
            </div>
          </div>
        );
      })}

      <style jsx>{`
        .signal-popup {
          animation: signal-enter ${ENTER_MS}ms ease-out both;
        }
        .signal-popup.is-exiting {
          animation: signal-exit ${EXIT_MS}ms ease-in forwards;
        }
        @keyframes signal-enter {
          from {
            opacity: 0;
            transform: translateY(6px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes signal-exit {
          from {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
          to {
            opacity: 0;
            transform: translateY(-4px) scale(0.97);
          }
        }
      `}</style>
    </div>
  );
}
