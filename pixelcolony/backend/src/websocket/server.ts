import { serverConfig } from "@/config";
import { BaseMessage, ErrorCodes, MessageHandlers } from "@/types";
import { log } from "@/utils/logger";
import { Server } from "http";
import WebSocket from "ws";
import { WebSocketConnection } from "./connection";

export class WebSocketServer {
  private wss?: WebSocket.Server;
  private connections: Map<string, WebSocketConnection> = new Map();
  private handlers: MessageHandlers = {};

  constructor() {
    this.setupDefaultHandlers();
  }

  public start(server: Server): void {
    this.wss = new WebSocket.Server({
      server,
      path: "/ws",
      clientTracking: false,
    });

    this.wss.on("connection", (ws, request) => {
      this.handleConnection(ws, request);
    });

    this.wss.on("error", (error) => {
      log.error("WebSocket server error", { error: error.message });
    });

    log.info("WebSocket server started", { path: "/ws" });
  }

  public stop(): void {
    if (!this.wss) return;

    // Close all connections
    this.connections.forEach((connection) => {
      connection.close(1001, "Server shutting down");
    });
    this.connections.clear();

    // Close the server
    this.wss.close(() => {
      log.info("WebSocket server stopped");
    });
  }

  private handleConnection(ws: WebSocket, request: any): void {
    const connection = new WebSocketConnection(ws, request);
    this.connections.set(connection.id, connection);

    // Setup message handler
    ws.on(
      "pixelcolony_message",
      (message: BaseMessage, conn: WebSocketConnection) => {
        this.handleMessage(message, conn);
      }
    );

    // Setup cleanup on disconnect
    ws.on("close", () => {
      this.connections.delete(connection.id);
    });

    log.debug("WebSocket connection established", {
      connectionId: connection.id,
      totalConnections: this.connections.size,
    });
  }

  private handleMessage(
    message: BaseMessage,
    connection: WebSocketConnection
  ): void {
    const handler = this.handlers[message.type];

    if (!handler) {
      connection.sendError(
        ErrorCodes.UNKNOWN_MESSAGE_TYPE,
        `Unknown message type: ${message.type}`,
        { messageType: message.type },
        message.id
      );
      return;
    }

    try {
      handler(message, connection);
    } catch (error) {
      log.error("Message handler error", {
        error: (error as Error).message,
        messageType: message.type,
        connectionId: connection.id,
      });

      connection.sendError(
        ErrorCodes.INTERNAL_ERROR,
        "Internal server error processing message",
        {},
        message.id
      );
    }
  }

  private setupDefaultHandlers(): void {
    // Default handlers will be overridden by services
    this.handlers = {};
  }

  public addHandler(
    messageType: string,
    handler: (message: BaseMessage, connection: WebSocketConnection) => void
  ): void {
    this.handlers[messageType] = handler;
    log.debug("Message handler registered", { messageType });
  }

  public removeHandler(messageType: string): void {
    delete this.handlers[messageType];
    log.debug("Message handler removed", { messageType });
  }

  public broadcastToRoom(
    roomId: string,
    message: BaseMessage,
    excludeConnectionId?: string
  ): void {
    const roomConnections = this.getConnectionsInRoom(roomId);

    roomConnections.forEach((connection) => {
      if (excludeConnectionId && connection.id === excludeConnectionId) {
        return;
      }

      connection.send(message);
    });

    log.debug("Broadcast sent to room", {
      roomId,
      messageType: message.type,
      connectionCount: roomConnections.length,
      excluded: excludeConnectionId || "none",
    });
  }

  public broadcastToUser(userId: string, message: BaseMessage): void {
    const userConnections = this.getConnectionsForUser(userId);

    userConnections.forEach((connection) => {
      connection.send(message);
    });

    log.debug("Broadcast sent to user", {
      userId,
      messageType: message.type,
      connectionCount: userConnections.length,
    });
  }

  public getConnection(connectionId: string): WebSocketConnection | undefined {
    return this.connections.get(connectionId);
  }

  public getConnectionsInRoom(roomId: string): WebSocketConnection[] {
    return Array.from(this.connections.values()).filter((conn) =>
      conn.isInRoom(roomId)
    );
  }

  public getConnectionsForUser(userId: string): WebSocketConnection[] {
    return Array.from(this.connections.values()).filter((conn) =>
      conn.isUser(userId)
    );
  }

  public getAllConnections(): WebSocketConnection[] {
    return Array.from(this.connections.values());
  }

  public getConnectionCount(): number {
    return this.connections.size;
  }

  public getActiveRooms(): string[] {
    const rooms = new Set<string>();

    this.connections.forEach((connection) => {
      if (connection.context.roomId) {
        rooms.add(connection.context.roomId);
      }
    });

    return Array.from(rooms);
  }

  public getRoomConnectionCount(roomId: string): number {
    return this.getConnectionsInRoom(roomId).length;
  }

  public getUserConnectionCount(userId: string): number {
    return this.getConnectionsForUser(userId).length;
  }

  public cleanupStaleConnections(): void {
    const staleConnections: WebSocketConnection[] = [];
    const maxAge = serverConfig.connectionTimeout;

    this.connections.forEach((connection) => {
      if (!connection.isHealthy() || connection.getConnectionAge() > maxAge) {
        staleConnections.push(connection);
      }
    });

    staleConnections.forEach((connection) => {
      log.debug("Cleaning up stale connection", {
        connectionId: connection.id,
        age: connection.getConnectionAge(),
        healthy: connection.isHealthy(),
      });

      connection.terminate();
      this.connections.delete(connection.id);
    });

    if (staleConnections.length > 0) {
      log.info("Cleaned up stale connections", {
        count: staleConnections.length,
        remaining: this.connections.size,
      });
    }
  }

  public getStats(): any {
    const rooms = this.getActiveRooms();
    const roomStats = rooms.reduce(
      (stats, roomId) => {
        const connections = this.getConnectionsInRoom(roomId);
        const masters = connections.filter((conn) => conn.isMaster()).length;
        const slaves = connections.filter((conn) => conn.isSlave()).length;

        stats[roomId] = {
          total: connections.length,
          masters,
          slaves,
        };

        return stats;
      },
      {} as Record<string, any>
    );

    return {
      totalConnections: this.connections.size,
      activeRooms: rooms.length,
      roomStats,
      timestamp: new Date().toISOString(),
    };
  }
}
