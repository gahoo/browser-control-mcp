import type {
  ExtensionMessage,
  ExtensionError,
  ServerMessageRequest,
} from "@browser-control-mcp/common";
import { getMessageSignature } from "./auth";

const RECONNECT_INTERVAL = 2000; // 2 seconds
const MAX_RECONNECT_ATTEMPTS = 5; // Before logging a warning

export class WebsocketClient {
  private socket: WebSocket | null = null;
  private readonly port: number;
  private readonly secret: string;
  private reconnectTimer: number | null = null;
  private connectionAttempts: number = 0;
  private messageCallback: ((data: ServerMessageRequest) => void) | null = null;
  private isConnected: boolean = false;
  private lastConnectedTime: number = 0;
  private totalReconnects: number = 0;

  constructor(port: number, secret: string) {
    this.port = port;
    this.secret = secret;
  }

  public connect(): void {
    this.connectionAttempts++;
    console.log(`[WebSocket] Connecting to ws://localhost:${this.port} (attempt ${this.connectionAttempts})`);

    this.socket = new WebSocket(`ws://localhost:${this.port}`);

    this.socket.addEventListener("open", () => {
      console.log(`[WebSocket] Connected to server at port ${this.port}`);
      this.isConnected = true;
      this.lastConnectedTime = Date.now();
      this.connectionAttempts = 0;

      if (this.totalReconnects > 0) {
        console.log(`[WebSocket] Reconnected successfully (total reconnects: ${this.totalReconnects})`);
      }
    });

    this.socket.addEventListener("close", (event) => {
      const wasConnected = this.isConnected;
      this.isConnected = false;

      if (wasConnected) {
        const uptime = Date.now() - this.lastConnectedTime;
        console.log(`[WebSocket] Connection closed (code: ${event.code}, reason: "${event.reason}", uptime: ${uptime}ms)`);
        this.totalReconnects++;
      } else {
        console.log(`[WebSocket] Connection failed (code: ${event.code})`);
      }
    });

    this.socket.addEventListener("error", (event) => {
      console.error("[WebSocket] Connection error:", event);
    });

    this.socket.addEventListener("message", async (event) => {
      if (this.messageCallback === null) {
        return;
      }
      try {
        const signedMessage = JSON.parse(event.data);
        const messageSig = await getMessageSignature(
          JSON.stringify(signedMessage.payload),
          this.secret
        );
        if (messageSig.length === 0 || messageSig !== signedMessage.signature) {
          console.error("[WebSocket] Invalid message signature");
          await this.sendErrorToServer(
            signedMessage.payload.correlationId,
            "Invalid message signature - extension and server not in sync"
          );
          return;
        }
        this.messageCallback(signedMessage.payload);
      } catch (error) {
        console.error("[WebSocket] Failed to parse message:", error);
      }
    });

    // Start reconnection timer if not already running
    if (this.reconnectTimer === null) {
      this.startReconnectTimer();
    }
  }

  public addMessageListener(
    callback: (data: ServerMessageRequest) => void
  ): void {
    this.messageCallback = callback;
  }

  private startReconnectTimer(): void {
    this.reconnectTimer = window.setInterval(() => {
      if (this.socket && this.socket.readyState === WebSocket.CONNECTING) {
        // Socket is still trying to connect
        if (this.connectionAttempts > MAX_RECONNECT_ATTEMPTS) {
          console.warn(`[WebSocket] Still connecting after ${this.connectionAttempts} attempts - resetting connection`);
          this.socket.close();
        }
      }

      if (!this.socket || this.socket.readyState === WebSocket.CLOSED) {
        this.connect();
      }
    }, RECONNECT_INTERVAL);
  }

  public async sendResourceToServer(resource: ExtensionMessage): Promise<void> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      console.error(`[WebSocket] Cannot send - socket not open (state: ${this.socket?.readyState})`);
      return;
    }
    const signedMessage = {
      payload: resource,
      signature: await getMessageSignature(
        JSON.stringify(resource),
        this.secret
      ),
    };
    this.socket.send(JSON.stringify(signedMessage));
  }

  public async sendErrorToServer(
    correlationId: string,
    errorMessage: string
  ): Promise<void> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      console.error(`[WebSocket] Cannot send error - socket not open (state: ${this.socket?.readyState})`);
      return;
    }
    const extensionError: ExtensionError = {
      correlationId,
      errorMessage: errorMessage,
    };
    this.socket.send(JSON.stringify(extensionError));
  }

  public disconnect(): void {
    console.log("[WebSocket] Disconnecting...");
    if (this.reconnectTimer !== null) {
      window.clearInterval(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    console.log("[WebSocket] Disconnected");
  }

  public getConnectionStatus(): { isConnected: boolean; totalReconnects: number } {
    return {
      isConnected: this.isConnected,
      totalReconnects: this.totalReconnects,
    };
  }
}
