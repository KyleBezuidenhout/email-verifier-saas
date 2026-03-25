"use client";

import { useState, useRef, useEffect } from "react";

interface Client {
  id: string;
  email: string;
  full_name: string | null;
  company_name: string | null;
}

interface Props {
  clients: Client[];
  value: string; // "all" or client UUID
  onChange: (clientId: string) => void;
}

export function ClientSelector({ clients, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selected = value === "all"
    ? null
    : clients.find((c) => c.id === value);

  const displayLabel = selected
    ? selected.full_name || selected.email
    : "All Clients";

  const filtered = clients.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.email.toLowerCase().includes(q) ||
      (c.company_name?.toLowerCase().includes(q) ?? false) ||
      (c.full_name?.toLowerCase().includes(q) ?? false)
    );
  });

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-4 py-2 rounded-lg border border-dashboard-border bg-dashboard-surface text-sm text-dashboard-text hover:border-dashboard-accent/40 transition-all min-w-[180px]"
      >
        <svg className="w-4 h-4 text-dashboard-text-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        <span className="truncate">{displayLabel}</span>
        <svg className={`w-3 h-3 text-dashboard-text-muted ml-auto transition-transform shrink-0 ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 z-50 glass-card shadow-2xl w-[300px] max-h-[400px] flex flex-col">
          <div className="p-2 border-b border-dashboard-border">
            <input
              type="text"
              placeholder="Search clients..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-dashboard-card border border-dashboard-border rounded-md text-dashboard-text placeholder-dashboard-text-muted focus:outline-none focus:border-dashboard-accent/40"
              autoFocus
            />
          </div>
          <div className="overflow-y-auto flex-1 p-1">
            <button
              onClick={() => { onChange("all"); setOpen(false); setSearch(""); }}
              className={`w-full text-left px-3 py-2 rounded-md text-sm transition-all ${
                value === "all"
                  ? "bg-dashboard-accent/15 text-dashboard-accent font-medium"
                  : "text-dashboard-text hover:bg-dashboard-card"
              }`}
            >
              All Clients
            </button>
            {filtered.map((c) => (
              <button
                key={c.id}
                onClick={() => { onChange(c.id); setOpen(false); setSearch(""); }}
                className={`w-full text-left px-3 py-2 rounded-md text-sm transition-all ${
                  value === c.id
                    ? "bg-dashboard-accent/15 text-dashboard-accent font-medium"
                    : "text-dashboard-text hover:bg-dashboard-card"
                }`}
              >
                <div className="truncate">
                  {c.full_name || c.email}
                  {c.company_name && (
                    <span className="text-dashboard-text-muted font-normal"> — {c.company_name}</span>
                  )}
                </div>
                <div className="text-xs text-dashboard-text-muted truncate">{c.email}</div>
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="px-3 py-4 text-sm text-dashboard-text-muted text-center">No clients found</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
