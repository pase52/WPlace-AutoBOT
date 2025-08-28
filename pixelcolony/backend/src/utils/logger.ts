import { logConfig } from "@/config";
import winston from "winston";

// Define log levels and colors
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const colors = {
  error: "red",
  warn: "yellow",
  info: "cyan",
  debug: "green",
};

winston.addColors(colors);

// Create formatters
const consoleFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
    return `${timestamp} [${level}]: ${message}${metaStr}`;
  })
);

const fileFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  logConfig.format === "json"
    ? winston.format.json()
    : winston.format.printf(({ timestamp, level, message, ...meta }) => {
        const metaStr = Object.keys(meta).length
          ? ` ${JSON.stringify(meta)}`
          : "";
        return `${timestamp} [${level.toUpperCase()}]: ${message}${metaStr}`;
      })
);

// Configure transports
const transports: winston.transport[] = [
  new winston.transports.Console({
    level: logConfig.level,
    format: logConfig.prettyPrint ? consoleFormat : fileFormat,
  }),
];

// Add file transport if configured
if (logConfig.file) {
  transports.push(
    new winston.transports.File({
      filename: logConfig.file,
      level: logConfig.level,
      format: fileFormat,
      maxsize: 10485760, // 10MB
      maxFiles: 5,
      tailable: true,
    })
  );
}

// Create logger instance
export const logger = winston.createLogger({
  levels,
  level: logConfig.level,
  transports,
  exitOnError: false,
  silent: process.env.NODE_ENV === "test",
});

// Helper functions for structured logging
export const log = {
  error: (message: string, meta?: Record<string, unknown>) => {
    logger.error(message, meta);
  },

  warn: (message: string, meta?: Record<string, unknown>) => {
    logger.warn(message, meta);
  },

  info: (message: string, meta?: Record<string, unknown>) => {
    logger.info(message, meta);
  },

  debug: (message: string, meta?: Record<string, unknown>) => {
    logger.debug(message, meta);
  },

  // WebSocket specific logging
  ws: {
    connect: (connectionId: string, userId?: string, roomId?: string) => {
      logger.info("WebSocket connected", {
        connectionId,
        userId,
        roomId,
        event: "ws_connect",
      });
    },

    disconnect: (connectionId: string, reason?: string) => {
      logger.info("WebSocket disconnected", {
        connectionId,
        reason,
        event: "ws_disconnect",
      });
    },

    message: (connectionId: string, messageType: string, messageId: string) => {
      logger.debug("WebSocket message received", {
        connectionId,
        messageType,
        messageId,
        event: "ws_message",
      });
    },

    error: (
      connectionId: string,
      error: Error,
      context?: Record<string, unknown>
    ) => {
      logger.error("WebSocket error", {
        connectionId,
        error: error.message,
        stack: error.stack,
        event: "ws_error",
        ...context,
      });
    },
  },

  // Room specific logging
  room: {
    created: (
      roomId: string,
      masterId: string,
      settings: Record<string, unknown>
    ) => {
      logger.info("Room created", {
        roomId,
        masterId,
        settings,
        event: "room_created",
      });
    },

    joined: (roomId: string, slaveId: string, slaveName?: string) => {
      logger.info("Slave joined room", {
        roomId,
        slaveId,
        slaveName,
        event: "room_joined",
      });
    },

    left: (roomId: string, userId: string, userType: "master" | "slave") => {
      logger.info("User left room", {
        roomId,
        userId,
        userType,
        event: "room_left",
      });
    },

    deleted: (roomId: string, reason: "cleanup" | "manual") => {
      logger.info("Room deleted", { roomId, reason, event: "room_deleted" });
    },

    error: (roomId: string, error: Error, operation: string) => {
      logger.error("Room operation failed", {
        roomId,
        operation,
        error: error.message,
        stack: error.stack,
        event: "room_error",
      });
    },
  },

  // Task specific logging
  task: {
    created: (taskIds: string[], roomId: string, count: number) => {
      logger.info("Tasks created", {
        taskIds,
        roomId,
        count,
        event: "tasks_created",
      });
    },

    claimed: (taskId: string, roomId: string, slaveId: string) => {
      logger.debug("Task claimed", {
        taskId,
        roomId,
        slaveId,
        event: "task_claimed",
      });
    },

    completed: (
      taskId: string,
      roomId: string,
      slaveId: string,
      status: string,
      duration: number
    ) => {
      logger.info("Task completed", {
        taskId,
        roomId,
        slaveId,
        status,
        duration,
        event: "task_completed",
      });
    },

    timeout: (taskId: string, roomId: string, slaveId: string) => {
      logger.warn("Task timeout", {
        taskId,
        roomId,
        slaveId,
        event: "task_timeout",
      });
    },

    error: (taskId: string, error: Error, operation: string) => {
      logger.error("Task operation failed", {
        taskId,
        operation,
        error: error.message,
        stack: error.stack,
        event: "task_error",
      });
    },
  },

  // Redis specific logging
  redis: {
    connect: () => {
      logger.info("Redis connected", { event: "redis_connect" });
    },

    disconnect: () => {
      logger.warn("Redis disconnected", { event: "redis_disconnect" });
    },

    error: (error: Error, operation?: string) => {
      logger.error("Redis error", {
        error: error.message,
        stack: error.stack,
        operation,
        event: "redis_error",
      });
    },

    pubsub: (
      channel: string,
      action: "subscribe" | "unsubscribe" | "publish",
      data?: unknown
    ) => {
      logger.debug("Redis pub/sub operation", {
        channel,
        action,
        data: data ? JSON.stringify(data) : undefined,
        event: "redis_pubsub",
      });
    },
  },

  // Performance and metrics logging
  performance: {
    request: (
      operation: string,
      duration: number,
      success: boolean,
      metadata?: Record<string, unknown>
    ) => {
      logger.info("Operation performance", {
        operation,
        duration,
        success,
        event: "performance",
        ...metadata,
      });
    },

    memory: (usage: NodeJS.MemoryUsage) => {
      logger.debug("Memory usage", {
        rss: usage.rss,
        heapUsed: usage.heapUsed,
        heapTotal: usage.heapTotal,
        external: usage.external,
        event: "memory_usage",
      });
    },
  },

  // Rate limiting logging
  rateLimit: {
    hit: (operation: string, identifier: string, remaining: number) => {
      logger.debug("Rate limit hit", {
        operation,
        identifier,
        remaining,
        event: "rate_limit_hit",
      });
    },

    exceeded: (operation: string, identifier: string, limit: number) => {
      logger.warn("Rate limit exceeded", {
        operation,
        identifier,
        limit,
        event: "rate_limit_exceeded",
      });
    },
  },

  // Application lifecycle logging
  app: {
    start: (config: Record<string, unknown>) => {
      logger.info("Application starting", { config, event: "app_start" });
    },

    ready: (port: number) => {
      logger.info("Application ready", { port, event: "app_ready" });
    },

    shutdown: (signal: string) => {
      logger.info("Application shutting down", {
        signal,
        event: "app_shutdown",
      });
    },

    error: (error: Error, context?: string) => {
      logger.error("Application error", {
        error: error.message,
        stack: error.stack,
        context,
        event: "app_error",
      });
    },
  },
};

// Error logging helper
export function logError(
  error: Error,
  context?: Record<string, unknown>
): void {
  logger.error(error.message, {
    error: error.message,
    stack: error.stack,
    name: error.name,
    ...context,
  });
}

// Express middleware for request logging
export function createRequestLogger() {
  return (req: any, res: any, next: any) => {
    const start = Date.now();

    res.on("finish", () => {
      const duration = Date.now() - start;
      const { method, url, ip } = req;
      const { statusCode } = res;

      logger.info("HTTP request", {
        method,
        url,
        statusCode,
        duration,
        ip,
        userAgent: req.get("User-Agent"),
        event: "http_request",
      });
    });

    next();
  };
}

// Stream for Morgan HTTP logging
export const morganStream = {
  write: (message: string) => {
    logger.info(message.trim(), { event: "http_access" });
  },
};

export default log;
