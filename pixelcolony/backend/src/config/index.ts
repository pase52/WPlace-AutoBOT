import { LogConfig, RateLimitConfig, RoomConfig, ServerConfig } from "@/types";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

function getEnvVar(name: string, defaultValue?: string): string {
  const value = process.env[name];
  if (value === undefined) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`Environment variable ${name} is required`);
  }
  return value;
}

function getEnvNumber(name: string, defaultValue?: number): number {
  const value = process.env[name];
  if (value === undefined) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`Environment variable ${name} is required`);
  }
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be a number`);
  }
  return parsed;
}

function getEnvBoolean(name: string, defaultValue?: boolean): boolean {
  const value = process.env[name];
  if (value === undefined) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`Environment variable ${name} is required`);
  }
  return value.toLowerCase() === "true";
}

export const serverConfig: ServerConfig = {
  port: getEnvNumber("PORT", 8080),
  wsPath: getEnvVar("WS_PATH", "/pixelcolony"),
  redisUrl: getEnvVar("REDIS_URL", "redis://localhost:6379"),
  heartbeatInterval: getEnvNumber("HEARTBEAT_INTERVAL", 30000),
  connectionTimeout: getEnvNumber("CONNECTION_TIMEOUT", 10000),
  corsEnabled: getEnvBoolean("CORS_ENABLED", true),
  corsOrigin: getEnvVar("CORS_ORIGIN", "*"),
  helmetEnabled: getEnvBoolean("HELMET_ENABLED", true),
  compressionEnabled: getEnvBoolean("COMPRESSION_ENABLED", true),
};

export const roomConfig: RoomConfig = {
  cleanupInterval: getEnvNumber("ROOM_CLEANUP_INTERVAL", 3600000), // 1 hour
  inactiveTimeout: getEnvNumber("ROOM_INACTIVE_TIMEOUT", 3600000), // 1 hour
  deleteTimeout: getEnvNumber("ROOM_DELETE_TIMEOUT", 86400000), // 24 hours
  taskTimeoutDefault: getEnvNumber("TASK_TIMEOUT_DEFAULT", 300000), // 5 minutes
  maxSlavesPerRoom: getEnvNumber("MAX_SLAVES_PER_ROOM", 50),
  maxTasksPerBatch: getEnvNumber("MAX_TASKS_PER_BATCH", 1000),
};

export const rateLimitConfig: RateLimitConfig = {
  enabled: getEnvBoolean("RATE_LIMIT_ENABLED", true),
  roomCreationPerHour: getEnvNumber("ROOM_CREATION_PER_HOUR", 10),
  taskCreationPerMinute: getEnvNumber("TASK_CREATION_PER_MINUTE", 100),
  roomJoiningPerMinute: getEnvNumber("ROOM_JOINING_PER_MINUTE", 20),
  messagesPerSecond: getEnvNumber("MESSAGES_PER_SECOND", 10),
};

export const logConfig: LogConfig = {
  level: getEnvVar("LOG_LEVEL", "info"),
  format: getEnvVar("LOG_FORMAT", "json"),
  file: process.env.LOG_FILE,
  prettyPrint: getEnvBoolean(
    "PRETTY_PRINT_LOGS",
    process.env.NODE_ENV === "development"
  ),
};

export const isDevelopment = process.env.NODE_ENV === "development";
export const isProduction = process.env.NODE_ENV === "production";
export const isTesting = process.env.NODE_ENV === "test";

// Validation
export function validateConfig(): void {
  const errors: string[] = [];

  // Validate port range
  if (serverConfig.port < 1 || serverConfig.port > 65535) {
    errors.push("PORT must be between 1 and 65535");
  }

  // Validate timeout values
  if (serverConfig.heartbeatInterval < 1000) {
    errors.push("HEARTBEAT_INTERVAL must be at least 1000ms");
  }

  if (serverConfig.connectionTimeout < 1000) {
    errors.push("CONNECTION_TIMEOUT must be at least 1000ms");
  }

  // Validate room timeouts
  if (roomConfig.taskTimeoutDefault < 10000) {
    errors.push("TASK_TIMEOUT_DEFAULT must be at least 10000ms");
  }

  if (roomConfig.inactiveTimeout < 60000) {
    errors.push("ROOM_INACTIVE_TIMEOUT must be at least 60000ms");
  }

  if (roomConfig.deleteTimeout < roomConfig.inactiveTimeout) {
    errors.push(
      "ROOM_DELETE_TIMEOUT must be greater than ROOM_INACTIVE_TIMEOUT"
    );
  }

  // Validate limits
  if (roomConfig.maxSlavesPerRoom < 1) {
    errors.push("MAX_SLAVES_PER_ROOM must be at least 1");
  }

  if (roomConfig.maxTasksPerBatch < 1) {
    errors.push("MAX_TASKS_PER_BATCH must be at least 1");
  }

  // Validate rate limits
  if (rateLimitConfig.enabled) {
    if (rateLimitConfig.roomCreationPerHour < 1) {
      errors.push("ROOM_CREATION_PER_HOUR must be at least 1");
    }

    if (rateLimitConfig.taskCreationPerMinute < 1) {
      errors.push("TASK_CREATION_PER_MINUTE must be at least 1");
    }

    if (rateLimitConfig.roomJoiningPerMinute < 1) {
      errors.push("ROOM_JOINING_PER_MINUTE must be at least 1");
    }

    if (rateLimitConfig.messagesPerSecond < 1) {
      errors.push("MESSAGES_PER_SECOND must be at least 1");
    }
  }

  // Validate log level
  const validLogLevels = ["error", "warn", "info", "debug"];
  if (!validLogLevels.includes(logConfig.level)) {
    errors.push(`LOG_LEVEL must be one of: ${validLogLevels.join(", ")}`);
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join("\n")}`);
  }
}

// Configuration summary for logging
export function getConfigSummary(): Record<string, unknown> {
  return {
    server: {
      port: serverConfig.port,
      wsPath: serverConfig.wsPath,
      redisUrl: serverConfig.redisUrl.replace(/\/\/.*@/, "//***@"), // Hide credentials
      heartbeatInterval: serverConfig.heartbeatInterval,
      connectionTimeout: serverConfig.connectionTimeout,
    },
    room: {
      cleanupInterval: roomConfig.cleanupInterval,
      inactiveTimeout: roomConfig.inactiveTimeout,
      deleteTimeout: roomConfig.deleteTimeout,
      taskTimeoutDefault: roomConfig.taskTimeoutDefault,
      maxSlavesPerRoom: roomConfig.maxSlavesPerRoom,
      maxTasksPerBatch: roomConfig.maxTasksPerBatch,
    },
    rateLimit: {
      enabled: rateLimitConfig.enabled,
      roomCreationPerHour: rateLimitConfig.roomCreationPerHour,
      taskCreationPerMinute: rateLimitConfig.taskCreationPerMinute,
      roomJoiningPerMinute: rateLimitConfig.roomJoiningPerMinute,
      messagesPerSecond: rateLimitConfig.messagesPerSecond,
    },
    logging: {
      level: logConfig.level,
      format: logConfig.format,
      prettyPrint: logConfig.prettyPrint,
    },
    environment: {
      isDevelopment,
      isProduction,
      isTesting,
    },
  };
}
