import { redis } from '@/redis/client';
import { RoomManager } from '@/services/roomManager';
import { TaskManager } from '@/services/taskManager';
import {
    BaseMessage,
    ClaimTaskMessage,
    CompleteTaskMessage,
    CreateRoomMessage,
    ErrorCodes,
    JoinRoomMessage,
    LeaveRoomMessage,
    RoomCreatedMessage,
    RoomJoinedMessage,
    TaskClaimedMessage,
    TaskCompletedMessage
} from '@/types';
import { formatTimestamp, isValidRoomId, isValidUUID } from '@/utils/helpers';
import { log } from '@/utils/logger';
import { WebSocketConnection } from '@/websocket/connection';
import { WebSocketServer } from '@/websocket/server';
import { Server } from 'http';
import { v4 as uuidv4 } from 'uuid';

export class PixelColonyService {
  private static instance: PixelColonyService;
  private wsServer: WebSocketServer;
  private roomManager: RoomManager;
  private taskManager: TaskManager;
  private isInitialized = false;

  public static getInstance(): PixelColonyService {
    if (!PixelColonyService.instance) {
      PixelColonyService.instance = new PixelColonyService();
    }
    return PixelColonyService.instance;
  }

  private constructor() {
    this.wsServer = new WebSocketServer();
    this.roomManager = RoomManager.getInstance();
    this.taskManager = TaskManager.getInstance();
  }

  public async initialize(server: Server): Promise<void> {
    if (this.isInitialized) {
      throw new Error("PixelColonyService already initialized");
    }

    // Initialize Redis connection
    await redis.connect();
    log.info("Redis client connected");

    // Start WebSocket server
    this.wsServer.start(server);
    log.info("WebSocket server started");

    // Register message handlers
    this.registerMessageHandlers();
    log.info("Message handlers registered");

    // Start cleanup tasks
    this.startCleanupTasks();
    log.info("Cleanup tasks started");

    this.isInitialized = true;
    log.info("PixelColonyService initialized successfully");
  }

  public async shutdown(): Promise<void> {
    if (!this.isInitialized) {
      return;
    }

    log.info("Shutting down PixelColonyService...");

    // Stop WebSocket server
    this.wsServer.stop();

    // Disconnect Redis
    await redis.disconnect();

    this.isInitialized = false;
    log.info("PixelColonyService shut down successfully");
  }

  private registerMessageHandlers(): void {
    // Room management
    this.wsServer.addHandler("create_room", this.handleCreateRoom.bind(this));
    this.wsServer.addHandler("join_room", this.handleJoinRoom.bind(this));
    this.wsServer.addHandler("leave_room", this.handleLeaveRoom.bind(this));

    // Task management
    this.wsServer.addHandler("claim_task", this.handleClaimTask.bind(this));
    this.wsServer.addHandler(
      "complete_task",
      this.handleCompleteTask.bind(this)
    );

    // Status and info
    this.wsServer.addHandler(
      "get_room_status",
      this.handleGetRoomStatus.bind(this)
    );
    this.wsServer.addHandler(
      "get_task_queue",
      this.handleGetTaskQueue.bind(this)
    );
  }

  private async handleCreateRoom(
    message: BaseMessage,
    connection: WebSocketConnection
  ): Promise<void> {
    try {
      const createMessage = message as CreateRoomMessage;
      const { masterId, settings } = createMessage.data;

      // Validate master ID
      if (!masterId || !isValidUUID(masterId)) {
        connection.sendError(
          ErrorCodes.INVALID_MESSAGE_FORMAT,
          "Invalid master ID",
          { masterId },
          message.id
        );
        return;
      }

      // Create room with default autoCleanup
      const roomSettings = { ...settings, autoCleanup: true };
      const roomId = await this.roomManager.createRoom(masterId, roomSettings);

      // Set user context
      connection.setUser(masterId, "master");
      connection.setRoom(roomId);

      // Send success response
      const response: RoomCreatedMessage = {
        type: "room_created",
        version: "v1",
        timestamp: formatTimestamp(),
        id: uuidv4(),
        data: {
          roomId,
          masterId,
          settings: roomSettings,
          createdAt: formatTimestamp(),
        },
      };

      connection.send(response);

      log.info("Room created successfully", {
        roomId,
        masterId,
        connectionId: connection.id,
      });
    } catch (error) {
      const err = error as Error;
      log.error("Failed to create room", {
        error: err.message,
        connectionId: connection.id,
      });

      connection.sendError(
        ErrorCodes.INTERNAL_SERVER_ERROR,
        err.message,
        {},
        message.id
      );
    }
  }

  private async handleJoinRoom(
    message: BaseMessage,
    connection: WebSocketConnection
  ): Promise<void> {
    try {
      const joinMessage = message as JoinRoomMessage;
      const { roomId, slaveId, slaveName } = joinMessage.data;

      // Validate parameters
      if (!roomId || !isValidRoomId(roomId)) {
        connection.sendError(
          ErrorCodes.INVALID_MESSAGE_FORMAT,
          "Invalid room ID",
          { roomId },
          message.id
        );
        return;
      }

      if (!slaveId || !isValidUUID(slaveId)) {
        connection.sendError(
          ErrorCodes.INVALID_MESSAGE_FORMAT,
          "Invalid slave ID",
          { slaveId },
          message.id
        );
        return;
      }

      // Check if room exists
      const room = await this.roomManager.getRoom(roomId);
      if (!room) {
        connection.sendError(
          ErrorCodes.ROOM_NOT_FOUND,
          "Room not found",
          { roomId },
          message.id
        );
        return;
      }

      // Add slave to room
      await this.roomManager.addSlaveToRoom(roomId, slaveId);

      // Set user context
      connection.setUser(slaveId, "slave");
      connection.setRoom(roomId);

      // Get updated room info
      const roomInfo = await this.roomManager.getRoom(roomId);

      // Send success response
      const response: RoomJoinedMessage = {
        type: "room_joined",
        version: "v1",
        timestamp: formatTimestamp(),
        id: uuidv4(),
        data: {
          roomId,
          slaveId,
          roomInfo: {
            masterId: roomInfo!.masterId,
            settings: roomInfo!.settings,
            statistics: roomInfo!.statistics,
            connectedSlaves: [], // Will be populated from actual connections
          },
        },
      };

      connection.send(response);

      // Broadcast to room
      this.wsServer.broadcastToRoom(
        roomId,
        {
          type: "slave_joined",
          version: "v1",
          timestamp: formatTimestamp(),
          id: uuidv4(),
          data: {
            roomId,
            slaveId,
            slaveName,
          },
        },
        connection.id
      );

      log.info("Slave joined room successfully", {
        roomId,
        slaveId,
        slaveName,
        connectionId: connection.id,
      });
    } catch (error) {
      const err = error as Error;
      log.error("Failed to join room", {
        error: err.message,
        connectionId: connection.id,
      });

      connection.sendError(
        ErrorCodes.INTERNAL_SERVER_ERROR,
        err.message,
        {},
        message.id
      );
    }
  }

  private async handleLeaveRoom(
    message: BaseMessage,
    connection: WebSocketConnection
  ): Promise<void> {
    try {
      const leaveMessage = message as LeaveRoomMessage;
      const { roomId, userId } = leaveMessage.data;

      // Validate parameters
      if (!roomId || !isValidRoomId(roomId)) {
        connection.sendError(
          ErrorCodes.INVALID_MESSAGE_FORMAT,
          "Invalid room ID",
          { roomId },
          message.id
        );
        return;
      }

      if (!userId || !isValidUUID(userId)) {
        connection.sendError(
          ErrorCodes.INVALID_MESSAGE_FORMAT,
          "Invalid user ID",
          { userId },
          message.id
        );
        return;
      }

      // Remove from room
      if (connection.isMaster()) {
        await this.roomManager.deactivateRoom(roomId);
      } else {
        await this.roomManager.removeSlaveFromRoom(roomId, userId);
      }

      // Clear room context
      connection.clearRoom();

      // Send success response
      connection.send({
        type: "room_left",
        version: "v1",
        timestamp: formatTimestamp(),
        id: uuidv4(),
        data: {
          roomId,
          userId,
          userType: connection.context.userType,
        },
      });

      log.info("User left room successfully", {
        roomId,
        userId,
        userType: connection.context.userType,
        connectionId: connection.id,
      });
    } catch (error) {
      const err = error as Error;
      log.error("Failed to leave room", {
        error: err.message,
        connectionId: connection.id,
      });

      connection.sendError(
        ErrorCodes.INTERNAL_SERVER_ERROR,
        err.message,
        {},
        message.id
      );
    }
  }

  private async handleClaimTask(
    message: BaseMessage,
    connection: WebSocketConnection
  ): Promise<void> {
    try {
      const claimMessage = message as ClaimTaskMessage;
      const { roomId, slaveId } = claimMessage.data;

      // Validate slave context
      if (!connection.isSlave() || !connection.isInRoom(roomId)) {
        connection.sendError(
          ErrorCodes.AUTHENTICATION_FAILED,
          "Not authorized to claim tasks in this room",
          { roomId, slaveId },
          message.id
        );
        return;
      }

      // Assign task
      const task = await this.taskManager.assignTask(roomId, slaveId);

      if (!task) {
        // No tasks available
        connection.send({
          type: "no_tasks_available",
          version: "v1",
          timestamp: formatTimestamp(),
          id: uuidv4(),
          data: {
            roomId,
            slaveId,
          },
        });
        return;
      }

      // Send task assignment
      const response: TaskClaimedMessage = {
        type: "task_claimed",
        version: "v1",
        timestamp: formatTimestamp(),
        id: uuidv4(),
        data: {
          taskId: task.taskId,
          roomId: task.roomId,
          slaveId,
          task: {
            ...task,
            assignedAt: task.assignedAt || formatTimestamp(),
          },
          timeout: 30000, // 30 seconds
        },
      };

      connection.send(response);

      log.debug("Task assigned successfully", {
        taskId: task.taskId,
        roomId,
        slaveId,
        connectionId: connection.id,
      });
    } catch (error) {
      const err = error as Error;
      log.error("Failed to claim task", {
        error: err.message,
        connectionId: connection.id,
      });

      connection.sendError(
        ErrorCodes.INTERNAL_SERVER_ERROR,
        err.message,
        {},
        message.id
      );
    }
  }

  private async handleCompleteTask(
    message: BaseMessage,
    connection: WebSocketConnection
  ): Promise<void> {
    try {
      const completeMessage = message as CompleteTaskMessage;
      const { taskId, slaveId, status, pixelsPlaced, error } =
        completeMessage.data;

      // Validate slave context
      if (!connection.isSlave() || !connection.isUser(slaveId)) {
        connection.sendError(
          ErrorCodes.AUTHENTICATION_FAILED,
          "Not authorized to complete this task",
          { taskId, slaveId },
          message.id
        );
        return;
      }

      // Complete task
      await this.taskManager.completeTask(taskId, slaveId, {
        success: status === "completed",
        pixelsPlaced: pixelsPlaced || 0,
        failureReason: error,
      });

      // Send success response
      const response: TaskCompletedMessage = {
        type: "task_completed",
        version: "v1",
        timestamp: formatTimestamp(),
        id: uuidv4(),
        data: {
          taskId,
          roomId: completeMessage.data.roomId,
          slaveId,
          status,
          statistics: {
            pixelsPlaced: pixelsPlaced || 0,
            duration: 0, // TODO: Calculate actual duration
          },
        },
      };

      connection.send(response);

      log.debug("Task completed successfully", {
        taskId,
        slaveId,
        status,
        pixelsPlaced,
        connectionId: connection.id,
      });
    } catch (error) {
      const err = error as Error;
      log.error("Failed to complete task", {
        error: err.message,
        connectionId: connection.id,
      });

      connection.sendError(
        ErrorCodes.INTERNAL_SERVER_ERROR,
        err.message,
        {},
        message.id
      );
    }
  }

  private async handleGetRoomStatus(
    message: BaseMessage,
    connection: WebSocketConnection
  ): Promise<void> {
    try {
      const roomId = connection.context.roomId;

      if (!roomId) {
        connection.sendError(
          ErrorCodes.AUTHENTICATION_FAILED,
          "Not in a room",
          {},
          message.id
        );
        return;
      }

      const [room, slaves, stats] = await Promise.all([
        this.roomManager.getRoom(roomId),
        this.roomManager.getRoomSlaves(roomId),
        this.taskManager.getRoomTaskStatistics(roomId),
      ]);

      if (!room) {
        connection.sendError(
          ErrorCodes.ROOM_NOT_FOUND,
          "Room not found",
          { roomId },
          message.id
        );
        return;
      }

      connection.send({
        type: "room_status",
        version: "v1",
        timestamp: formatTimestamp(),
        id: uuidv4(),
        data: {
          room,
          slaves,
          taskStatistics: stats,
        },
      });
    } catch (error) {
      const err = error as Error;
      log.error("Failed to get room status", {
        error: err.message,
        connectionId: connection.id,
      });

      connection.sendError(
        ErrorCodes.INTERNAL_SERVER_ERROR,
        err.message,
        {},
        message.id
      );
    }
  }

  private async handleGetTaskQueue(
    message: BaseMessage,
    connection: WebSocketConnection
  ): Promise<void> {
    try {
      const roomId = connection.context.roomId;

      if (!roomId || !connection.isMaster()) {
        connection.sendError(
          ErrorCodes.AUTHENTICATION_FAILED,
          "Not authorized to view task queue",
          {},
          message.id
        );
        return;
      }

      const tasks = await this.taskManager.getRoomTasks(roomId);

      connection.send({
        type: "task_queue",
        version: "v1",
        timestamp: formatTimestamp(),
        id: uuidv4(),
        data: {
          roomId,
          tasks,
        },
      });
    } catch (error) {
      const err = error as Error;
      log.error("Failed to get task queue", {
        error: err.message,
        connectionId: connection.id,
      });

      connection.sendError(
        ErrorCodes.INTERNAL_SERVER_ERROR,
        err.message,
        {},
        message.id
      );
    }
  }

  private startCleanupTasks(): void {
    // Clean up expired tasks every minute
    setInterval(async () => {
      try {
        await this.taskManager.cleanupExpiredTasks();
      } catch (error) {
        log.error("Task cleanup failed", { error: (error as Error).message });
      }
    }, 60000);

    // Clean up inactive rooms every 5 minutes
    setInterval(async () => {
      try {
        await this.roomManager.cleanupInactiveRooms();
      } catch (error) {
        log.error("Room cleanup failed", { error: (error as Error).message });
      }
    }, 5 * 60000);

    // Clean up stale WebSocket connections every 30 seconds
    setInterval(() => {
      try {
        this.wsServer.cleanupStaleConnections();
      } catch (error) {
        log.error("Connection cleanup failed", {
          error: (error as Error).message,
        });
      }
    }, 30000);

    log.info("Cleanup tasks scheduled");
  }

  // Public API methods for external use
  public getWebSocketServer(): WebSocketServer {
    return this.wsServer;
  }

  public getRoomManager(): RoomManager {
    return this.roomManager;
  }

  public getTaskManager(): TaskManager {
    return this.taskManager;
  }

  public getStats() {
    return {
      websocket: this.wsServer.getStats(),
      redis: redis.getStatus(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    };
  }
}
