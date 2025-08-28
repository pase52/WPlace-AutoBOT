import { v4 as uuidv4 } from "uuid";

/**
 * Generate a unique task ID
 */
export function generateTaskId(): string {
  return uuidv4();
}

/**
 * Generate a secure 8-character alphanumeric room ID
 */
export function generateRoomId(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let result = "";
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Generate a UUIDv4 for bot identification
 */
export function generateBotId(): string {
  return uuidv4();
}

/**
 * Generate a UUIDv4 for message identification
 */
export function generateMessageId(): string {
  return uuidv4();
}

/**
 * Validate room ID format (8 alphanumeric characters)
 */
export function isValidRoomId(roomId: string): boolean {
  if (!roomId || roomId.length !== 8) return false;
  return /^[A-Za-z0-9]{8}$/.test(roomId);
}

/**
 * Validate UUID format
 */
export function isValidUUID(uuid: string): boolean {
  if (!uuid) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    uuid
  );
}

/**
 * Validate task size format
 */
export function isValidTaskSize(
  size: string
): size is "1x1" | "3x3" | "5x5" | "10x10" {
  return ["1x1", "3x3", "5x5", "10x10"].includes(size);
}

/**
 * Parse task size to dimensions
 */
export function parseTaskSize(size: "1x1" | "3x3" | "5x5" | "10x10"): {
  width: number;
  height: number;
} {
  const sizeMap = {
    "1x1": { width: 1, height: 1 },
    "3x3": { width: 3, height: 3 },
    "5x5": { width: 5, height: 5 },
    "10x10": { width: 10, height: 10 },
  };
  return sizeMap[size];
}

/**
 * Validate pixel coordinates
 */
export function isValidCoordinates(x: number, y: number): boolean {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0;
}

/**
 * Validate color ID (wplace.live uses 1-64)
 */
export function isValidColorId(colorId: number): boolean {
  return Number.isInteger(colorId) && colorId >= 1 && colorId <= 64;
}

/**
 * Sanitize user input string
 */
export function sanitizeString(input: string, maxLength = 100): string {
  if (!input || typeof input !== "string") return "";
  return input.trim().substring(0, maxLength);
}

/**
 * Format timestamp to ISO string
 */
export function formatTimestamp(date?: Date): string {
  return (date || new Date()).toISOString();
}

/**
 * Parse timestamp from ISO string
 */
export function parseTimestamp(timestamp: string): Date {
  return new Date(timestamp);
}

/**
 * Calculate duration between timestamps in milliseconds
 */
export function calculateDuration(startTime: string, endTime?: string): number {
  const start = parseTimestamp(startTime);
  const end = endTime ? parseTimestamp(endTime) : new Date();
  return end.getTime() - start.getTime();
}

/**
 * Check if timestamp is expired
 */
export function isExpired(timestamp: string, timeoutMs: number): boolean {
  const duration = calculateDuration(timestamp);
  return duration > timeoutMs;
}

/**
 * Create a delay promise for async operations
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry an async operation with exponential backoff
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;

      if (attempt === maxRetries) {
        throw lastError;
      }

      const delayMs = baseDelay * Math.pow(2, attempt);
      await delay(delayMs);
    }
  }

  throw lastError!;
}

/**
 * Rate limiting utility using in-memory storage
 */
export class RateLimiter {
  private records: Map<string, { count: number; resetTime: number }> =
    new Map();

  constructor(
    private limit: number,
    private windowMs: number
  ) {}

  public check(identifier: string): {
    allowed: boolean;
    remaining: number;
    resetTime: number;
  } {
    const now = Date.now();
    const record = this.records.get(identifier);

    if (!record || now > record.resetTime) {
      // New window or expired window
      const resetTime = now + this.windowMs;
      this.records.set(identifier, { count: 1, resetTime });
      return { allowed: true, remaining: this.limit - 1, resetTime };
    }

    if (record.count >= this.limit) {
      // Rate limit exceeded
      return { allowed: false, remaining: 0, resetTime: record.resetTime };
    }

    // Increment count
    record.count++;
    this.records.set(identifier, record);
    return {
      allowed: true,
      remaining: this.limit - record.count,
      resetTime: record.resetTime,
    };
  }

  public reset(identifier: string): void {
    this.records.delete(identifier);
  }

  public cleanup(): void {
    const now = Date.now();
    for (const [key, record] of this.records.entries()) {
      if (now > record.resetTime) {
        this.records.delete(key);
      }
    }
  }
}

/**
 * Memory usage monitoring utility
 */
export function getMemoryUsage(): NodeJS.MemoryUsage {
  return process.memoryUsage();
}

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";

  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

/**
 * Format duration to human readable string
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
}

/**
 * Deep clone an object
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Check if an object is empty
 */
export function isEmpty(obj: any): boolean {
  if (obj == null) return true;
  if (Array.isArray(obj)) return obj.length === 0;
  if (typeof obj === "object") return Object.keys(obj).length === 0;
  return false;
}

/**
 * Safe JSON parse with error handling
 */
export function safeJsonParse<T>(json: string, defaultValue: T): T {
  try {
    return JSON.parse(json);
  } catch {
    return defaultValue;
  }
}

/**
 * Safe JSON stringify with error handling
 */
export function safeJsonStringify(
  obj: any,
  defaultValue: string = "{}"
): string {
  try {
    return JSON.stringify(obj);
  } catch {
    return defaultValue;
  }
}

/**
 * Extract IP address from request
 */
export function extractIP(headers: any, socket: any): string {
  // Check for forwarded headers (proxy/load balancer)
  const forwardedFor = headers["x-forwarded-for"];
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }

  const realIP = headers["x-real-ip"];
  if (realIP) {
    return realIP;
  }

  // Fallback to socket address
  return socket.remoteAddress || "unknown";
}

/**
 * Extract User-Agent from headers
 */
export function extractUserAgent(headers: any): string {
  return headers["user-agent"] || "unknown";
}

/**
 * Create error response object
 */
export function createErrorResponse(
  code: string,
  message: string,
  details?: any
): any {
  return {
    code,
    message,
    details,
    timestamp: formatTimestamp(),
  };
}

/**
 * Validate WebSocket message structure
 */
export function isValidMessage(message: any): boolean {
  if (!message || typeof message !== "object") return false;
  if (!message.type || typeof message.type !== "string") return false;
  if (!message.version || typeof message.version !== "string") return false;
  if (!message.timestamp || typeof message.timestamp !== "string") return false;
  if (!message.id || typeof message.id !== "string") return false;
  return true;
}

/**
 * Calculate task priority based on position and room settings
 */
export function calculateTaskPriority(x: number, y: number): number {
  // Default priority calculation (can be customized)
  // Higher priority for tasks closer to origin
  return Math.max(1, 1000 - Math.sqrt(x * x + y * y));
}

/**
 * Chunk array into smaller arrays
 */
export function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * Generate task grid coordinates for an image region
 */
export function generateTaskGrid(
  startX: number,
  startY: number,
  width: number,
  height: number,
  taskSize: "1x1" | "3x3" | "5x5" | "10x10"
): Array<{ x: number; y: number; width: number; height: number }> {
  const { width: taskWidth, height: taskHeight } = parseTaskSize(taskSize);
  const tasks: Array<{ x: number; y: number; width: number; height: number }> =
    [];

  for (let y = startY; y < startY + height; y += taskHeight) {
    for (let x = startX; x < startX + width; x += taskWidth) {
      const taskEndX = Math.min(x + taskWidth, startX + width);
      const taskEndY = Math.min(y + taskHeight, startY + height);

      tasks.push({
        x,
        y,
        width: taskEndX - x,
        height: taskEndY - y,
      });
    }
  }

  return tasks;
}
