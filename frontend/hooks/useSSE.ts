"use client";

import { useEffect, useRef } from "react";
import { SSEClient } from "@/lib/sse";
import { JobProgress } from "@/types";

export function useSSE(
  jobId: string | null,
  token: string | null,
  onMessage: (data: JobProgress) => void,
  onError?: (error: Event) => void
) {
  const sseClientRef = useRef<SSEClient | null>(null);

  useEffect(() => {
    if (!jobId || !token) return;

    const client = new SSEClient();
    sseClientRef.current = client;

    client.onMessage(onMessage);
    if (onError) {
      client.onError(onError);
    }

    client.connect(jobId, token);

    return () => {
      client.close();
    };
  }, [jobId, token, onMessage, onError]);

  return sseClientRef.current;
}


