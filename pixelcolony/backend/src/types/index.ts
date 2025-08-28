// PixelColony Type Definitions

export interface BaseMessage {
  type: string;
  version: string;
  timestamp: string;
  id: string; // Message ID for tracking
  data: any; // Message-specific payload
}

// Room Management Types
export interface RoomSettings {
  taskSize: "1x1" | "3x3" | "5x5" | "10x10";
  taskTimeout: number; // milliseconds
  description?: string;
  maxSlaves?: number;
  autoCleanup: boolean;
}

export interface RoomStatistics {
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  activeTasks: number;
  averageTaskDuration: number;
  totalPixelsPlaced: number;
  connectedSlaves: number;
  uptime: number; // milliseconds
}

export interface Room {
  roomId: string; // 8-char alphanumeric
  masterId: string;
  status: "active" | "inactive";
  createdAt: string;
  lastActivity: string;
  settings: RoomSettings;
  statistics: RoomStatistics;
}

// Task Management Types
export interface PixelData {
  x: number;
  y: number;
  colorId: number;
}

export interface TaskCoordinates {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TaskDefinition {
  coordinates: TaskCoordinates;
  pixels: PixelData[];
  priority?: number;
}

export interface Task {
  taskId: string; // UUIDv4
  roomId: string;
  status: "todo" | "in_progress" | "completed" | "failed" | "timeout";
  coordinates: TaskCoordinates;
  pixels: PixelData[];
  assignedTo?: string; // slaveId
  createdAt: string;
  assignedAt?: string;
  completedAt?: string;
  failedAt?: string;
  failureReason?: string;
  timeout: number; // milliseconds
  priority: number;
  retryCount: number;
  statistics?: {
    pixelsPlaced: number;
    pixelsFailed: number;
    averagePlacementTime: number;
    totalTime: number;
  };
}

export interface TaskData {
  coordinates: TaskCoordinates;
  pixels: PixelData[];
  createdAt: string;
  assignedAt: string;
}

// User Management Types
export interface SlaveStatistics {
  tasksCompleted: number;
  tasksFailed: number;
  pixelsPlaced: number;
  averageDuration: number;
}

export interface SlaveInfo {
  slaveId: string;
  slaveName?: string;
  connectedAt: string;
  currentTask?: {
    taskId: string;
    assignedAt: string;
    timeout: string;
  };
  statistics: SlaveStatistics;
}

export interface Connection {
  connectionId: string;
  userId: string; // masterId or slaveId
  userType: "master" | "slave";
  roomId?: string;
  connectedAt: string;
  lastHeartbeat: string;
  ipAddress: string;
  userAgent: string;
}

// Message Types
export interface CreateRoomMessage extends BaseMessage {
  type: "room_create";
  data: {
    masterId: string; // UUIDv4
    settings: Omit<RoomSettings, "autoCleanup">;
  };
}

export interface RoomCreatedMessage extends BaseMessage {
  type: "room_created";
  data: {
    roomId: string; // 8-char alphanumeric
    masterId: string;
    settings: RoomSettings;
    createdAt: string;
  };
}

export interface JoinRoomMessage extends BaseMessage {
  type: "room_join";
  data: {
    roomId: string;
    slaveId: string; // UUIDv4
    slaveName?: string;
  };
}

export interface RoomJoinedMessage extends BaseMessage {
  type: "room_joined";
  data: {
    roomId: string;
    slaveId: string;
    roomInfo: {
      masterId: string;
      settings: RoomSettings;
      statistics: RoomStatistics;
      connectedSlaves: SlaveInfo[];
    };
  };
}

export interface LeaveRoomMessage extends BaseMessage {
  type: "room_leave";
  data: {
    roomId: string;
    userId: string; // masterId or slaveId
  };
}

export interface CreateTasksMessage extends BaseMessage {
  type: "tasks_create";
  data: {
    roomId: string;
    masterId: string;
    tasks: TaskDefinition[];
  };
}

export interface TasksCreatedMessage extends BaseMessage {
  type: "tasks_created";
  data: {
    roomId: string;
    taskIds: string[];
    totalTasks: number;
  };
}

export interface ClaimTaskMessage extends BaseMessage {
  type: "task_claim";
  data: {
    roomId: string;
    slaveId: string;
  };
}

export interface TaskClaimedMessage extends BaseMessage {
  type: "task_claimed";
  data: {
    taskId: string;
    roomId: string;
    slaveId: string;
    task: TaskData;
    timeout: number; // milliseconds
  };
}

export interface NoTasksMessage extends BaseMessage {
  type: "no_tasks";
  data: {
    roomId: string;
    slaveId: string;
    reason: "queue_empty" | "max_tasks_reached";
  };
}

export interface CompleteTaskMessage extends BaseMessage {
  type: "task_complete";
  data: {
    taskId: string;
    roomId: string;
    slaveId: string;
    status: "completed" | "failed";
    error?: string; // If status is "failed"
    pixelsPlaced?: number; // Number of pixels successfully placed
    completedAt: string;
  };
}

export interface TaskCompletedMessage extends BaseMessage {
  type: "task_completed";
  data: {
    taskId: string;
    roomId: string;
    slaveId: string;
    status: "completed" | "failed" | "timeout";
    statistics: {
      pixelsPlaced: number;
      duration: number; // milliseconds
    };
  };
}

export interface RoomStatusMessage extends BaseMessage {
  type: "room_status";
  data: {
    roomId: string;
    statistics: RoomStatistics;
    connectedSlaves: SlaveInfo[];
    queueStatus: {
      todoTasks: number;
      inProgressTasks: number;
      completedTasks: number;
      failedTasks: number;
    };
  };
}

export interface HeartbeatMessage extends BaseMessage {
  type: "heartbeat";
  data: {
    userId: string;
    roomId?: string;
  };
}

export interface HeartbeatResponseMessage extends BaseMessage {
  type: "heartbeat_response";
  data: {
    serverTime: string;
    roomActive: boolean;
  };
}

export interface ErrorMessage extends BaseMessage {
  type: "error";
  data: {
    code: string;
    message: string;
    details?: any;
    requestId?: string; // Original message ID that caused error
  };
}

export interface RateLimitMessage extends BaseMessage {
  type: "rate_limit";
  data: {
    operation: string;
    limit: number;
    remaining: number;
    resetTime: string;
  };
}

// Error Codes
export enum ErrorCodes {
  ROOM_NOT_FOUND = "ROOM_NOT_FOUND",
  ROOM_FULL = "ROOM_FULL",
  INVALID_MASTER = "INVALID_MASTER",
  TASK_NOT_FOUND = "TASK_NOT_FOUND",
  TASK_ALREADY_ASSIGNED = "TASK_ALREADY_ASSIGNED",
  INVALID_MESSAGE_FORMAT = "INVALID_MESSAGE_FORMAT",
  AUTHENTICATION_FAILED = "AUTHENTICATION_FAILED",
  RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED",
  INTERNAL_SERVER_ERROR = "INTERNAL_SERVER_ERROR",
  UNKNOWN_MESSAGE_TYPE = "UNKNOWN_MESSAGE_TYPE",
  INTERNAL_ERROR = "INTERNAL_ERROR",
}

// Configuration Types
export interface ServerConfig {
  port: number;
  wsPath: string;
  redisUrl: string;
  heartbeatInterval: number;
  connectionTimeout: number;
  corsEnabled: boolean;
  corsOrigin: string;
  helmetEnabled: boolean;
  compressionEnabled: boolean;
}

export interface RoomConfig {
  cleanupInterval: number;
  inactiveTimeout: number;
  deleteTimeout: number;
  taskTimeoutDefault: number;
  maxSlavesPerRoom: number;
  maxTasksPerBatch: number;
}

export interface RateLimitConfig {
  enabled: boolean;
  roomCreationPerHour: number;
  taskCreationPerMinute: number;
  roomJoiningPerMinute: number;
  messagesPerSecond: number;
}

export interface LogConfig {
  level: string;
  format: string;
  file?: string;
  prettyPrint: boolean;
}

// WebSocket Connection Context
export interface WSContext {
  connectionId: string;
  userId?: string;
  userType?: "master" | "slave";
  roomId?: string;
  connectedAt: Date;
  lastHeartbeat: Date;
  ip: string;
  userAgent: string;
}

export interface TaskStatistics {
  totalTasks: number;
  assignedTasks: number;
  completedTasks: number;
  averageTimePerTask: number;
  tasksPerMinute: number;
}

// Task status type alias
export type TaskStatus =
  | "todo"
  | "in_progress"
  | "completed"
  | "failed"
  | "timeout";

// Message handler type
export type MessageHandler = (message: BaseMessage, connection: any) => void;
export interface MessageHandlers {
  [messageType: string]: MessageHandler;
}

// Redis Key Patterns
export const REDIS_KEYS = {
  ROOM: (roomId: string) => `room:${roomId}`,
  ROOM_SLAVES: (roomId: string) => `room:${roomId}:slaves`,
  ROOM_MASTER: (masterId: string) => `room:master:${masterId}`,
  TASK: (taskId: string) => `task:${taskId}`,
  ROOM_TASKS_TODO: (roomId: string) => `room:${roomId}:tasks:todo`,
  ROOM_TASKS_IN_PROGRESS: (roomId: string) =>
    `room:${roomId}:tasks:in_progress`,
  ROOM_TASKS_COMPLETED: (roomId: string) => `room:${roomId}:tasks:completed`,
  ROOM_TASKS_FAILED: (roomId: string) => `room:${roomId}:tasks:failed`,
  CONNECTION: (connectionId: string) => `connection:${connectionId}`,
  USER_CONNECTION: (userId: string) => `user:${userId}:connection`,
  ROOM_CONNECTIONS: (roomId: string) => `room:${roomId}:connections`,
  ROOM_STATS: (roomId: string) => `room:${roomId}:stats`,
  SLAVE_STATS: (slaveId: string) => `slave:${slaveId}:stats`,
  ACTIVE_ROOMS: "active_rooms",
  RATE_LIMIT: (operation: string, identifier: string) =>
    `rate_limit:${operation}:${identifier}`,
} as const;

// Redis Pub/Sub Channels
export const REDIS_CHANNELS = {
  ROOM: (roomId: string) => `room:${roomId}`,
  ROOM_MASTER: (roomId: string) => `room:${roomId}:master`,
  GLOBAL: "global",
} as const;
