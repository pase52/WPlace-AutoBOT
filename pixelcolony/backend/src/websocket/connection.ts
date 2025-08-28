import { serverConfig } from "@/config";
import {
  BaseMessage,
  ErrorCodes,
  ErrorMessage,
  HeartbeatMessage,
  HeartbeatResponseMessage,
  WSContext,
} from "@/types";
import {
  extractIP,
  extractUserAgent,
  formatTimestamp,
  isValidMessage,
  safeJsonParse,
} from "@/utils/helpers";
import { log } from "@/utils/logger";
import { IncomingMessage } from "http";
import { v4 as uuidv4 } from "uuid";
import WebSocket from "ws";

export class WebSocketConnection {
  public readonly id: string;
  public readonly ws: WebSocket;
  public readonly context: WSContext;
  private heartbeatInterval?: NodeJS.Timeout;
  private lastHeartbeat: Date = new Date();
  private isAlive: boolean = true;

  constructor(ws: WebSocket, request: IncomingMessage) {
    this.id = uuidv4();
    this.ws = ws;
    this.context = {
      connectionId: this.id,
      connectedAt: new Date(),
      lastHeartbeat: new Date(),
      ip: extractIP(request.headers, request.socket),
      userAgent: extractUserAgent(request.headers),
    };

    this.setupEventHandlers();
    this.startHeartbeat();

    log.ws.connect(this.id);
  }

  private setupEventHandlers(): void {
    this.ws.on("message", (data) => {
      this.handleMessage(data);
    });

    this.ws.on("pong", () => {
      this.isAlive = true;
      this.lastHeartbeat = new Date();
      this.context.lastHeartbeat = this.lastHeartbeat;
    });

    this.ws.on("close", (code, reason) => {
      this.cleanup();
      log.ws.disconnect(this.id, `Code: ${code}, Reason: ${reason.toString()}`);
    });

    this.ws.on("error", (error) => {
      log.ws.error(this.id, error);
      this.cleanup();
    });
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (!this.isAlive) {
        log.ws.disconnect(this.id, "heartbeat_timeout");
        this.ws.terminate();
        return;
      }

      this.isAlive = false;
      this.ws.ping();
    }, serverConfig.heartbeatInterval);
  }

  private handleMessage(data: WebSocket.Data): void {
    try {
      const messageStr = data.toString();
      const parsedMessage = safeJsonParse(messageStr, null);

      if (!parsedMessage || !isValidMessage(parsedMessage)) {
        this.sendError(
          ErrorCodes.INVALID_MESSAGE_FORMAT,
          "Invalid message format"
        );
        return;
      }

      const message = parsedMessage as BaseMessage;
      log.ws.message(this.id, message.type, message.id);

      // Handle heartbeat messages internally
      if (message.type === "heartbeat") {
        this.handleHeartbeat(message as HeartbeatMessage);
        return;
      }

      // Emit message event for handlers
      this.ws.emit("pixelcolony_message", message, this);
    } catch (error) {
      log.ws.error(this.id, error as Error, { operation: "handle_message" });
      this.sendError(
        ErrorCodes.INVALID_MESSAGE_FORMAT,
        "Failed to parse message"
      );
    }
  }

  private handleHeartbeat(message: HeartbeatMessage): void {
    const response: HeartbeatResponseMessage = {
      type: "heartbeat_response",
      version: "v1",
      timestamp: formatTimestamp(),
      id: uuidv4(),
      data: {
        serverTime: formatTimestamp(),
        roomActive: !!this.context.roomId,
      },
    };

    this.send(response);
  }

  public send(message: BaseMessage): void {
    if (this.ws.readyState !== WebSocket.OPEN) {
      log.debug("Attempted to send message to closed WebSocket", {
        connectionId: this.id,
        messageType: message.type,
      });
      return;
    }

    try {
      const messageStr = JSON.stringify(message);
      this.ws.send(messageStr);
    } catch (error) {
      log.ws.error(this.id, error as Error, {
        operation: "send_message",
        messageType: message.type,
      });
    }
  }

  public sendError(
    code: ErrorCodes,
    message: string,
    details?: any,
    requestId?: string
  ): void {
    const errorMessage: ErrorMessage = {
      type: "error",
      version: "v1",
      timestamp: formatTimestamp(),
      id: uuidv4(),
      data: {
        code,
        message,
        details,
        requestId,
      },
    };

    this.send(errorMessage);
  }

  public setUser(userId: string, userType: "master" | "slave"): void {
    this.context.userId = userId;
    this.context.userType = userType;

    log.debug("User set for WebSocket connection", {
      connectionId: this.id,
      userId,
      userType,
    });
  }

  public setRoom(roomId: string): void {
    this.context.roomId = roomId;

    log.debug("Room set for WebSocket connection", {
      connectionId: this.id,
      roomId,
    });
  }

  public clearRoom(): void {
    delete this.context.roomId;

    log.debug("Room cleared for WebSocket connection", {
      connectionId: this.id,
    });
  }

  public isInRoom(roomId: string): boolean {
    return this.context.roomId === roomId;
  }

  public isUser(userId: string): boolean {
    return this.context.userId === userId;
  }

  public isMaster(): boolean {
    return this.context.userType === "master";
  }

  public isSlave(): boolean {
    return this.context.userType === "slave";
  }

  public isHealthy(): boolean {
    return this.ws.readyState === WebSocket.OPEN && this.isAlive;
  }

  public getConnectionAge(): number {
    return Date.now() - this.context.connectedAt.getTime();
  }

  public getTimeSinceLastHeartbeat(): number {
    return Date.now() - this.lastHeartbeat.getTime();
  }

  public close(code?: number, reason?: string): void {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.close(code, reason);
    }
    this.cleanup();
  }

  public terminate(): void {
    this.ws.terminate();
    this.cleanup();
  }

  private cleanup(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
    }

    // Remove event listeners to prevent memory leaks
    this.ws.removeAllListeners();
  }

  public toJSON(): any {
    return {
      id: this.id,
      context: {
        ...this.context,
        connectedAt: this.context.connectedAt.toISOString(),
        lastHeartbeat: this.context.lastHeartbeat.toISOString(),
      },
      isAlive: this.isAlive,
      readyState: this.ws.readyState,
      connectionAge: this.getConnectionAge(),
      timeSinceLastHeartbeat: this.getTimeSinceLastHeartbeat(),
    };
  }
}
