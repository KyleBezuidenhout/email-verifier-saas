import { JobProgress } from "@/types";

export class SSEClient {
  private eventSource: EventSource | null = null;
  private onMessageCallback: ((data: JobProgress) => void) | null = null;
  private onErrorCallback: ((error: Event) => void) | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

  connect(jobId: string, token: string): void {
    const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.billionverifier.io";
    const url = `${API_URL}/api/v1/jobs/${jobId}/progress?token=${token}`;

    this.eventSource = new EventSource(url);

    this.eventSource.onmessage = (event) => {
      try {
        const data: JobProgress = JSON.parse(event.data);
        if (this.onMessageCallback) {
          this.onMessageCallback(data);
        }
        this.reconnectAttempts = 0; // Reset on successful message
      } catch (error) {
        console.error("Error parsing SSE message:", error);
      }
    };

    this.eventSource.onerror = (error) => {
      console.error("SSE connection error:", error);
      if (this.onErrorCallback) {
        this.onErrorCallback(error);
      }
      this.reconnect(jobId, token);
    };

    this.eventSource.addEventListener("open", () => {
      console.log("SSE connection opened");
      this.reconnectAttempts = 0;
    });
  }

  private reconnect(jobId: string, token: string): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error("Max reconnection attempts reached");
      this.close();
      return;
    }

    this.reconnectAttempts++;
    setTimeout(() => {
      console.log(`Reconnecting... Attempt ${this.reconnectAttempts}`);
      this.close();
      this.connect(jobId, token);
    }, this.reconnectDelay * this.reconnectAttempts);
  }

  onMessage(callback: (data: JobProgress) => void): void {
    this.onMessageCallback = callback;
  }

  onError(callback: (error: Event) => void): void {
    this.onErrorCallback = callback;
  }

  close(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }
}


