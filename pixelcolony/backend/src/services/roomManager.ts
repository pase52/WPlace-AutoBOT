import { redis } from "@/redis/client";
import {
  REDIS_CHANNELS,
  REDIS_KEYS,
  Room,
  RoomSettings,
  RoomStatistics,
  SlaveInfo,
} from "@/types";
import {
  formatTimestamp,
  generateRoomId,
  isValidRoomId,
  isValidUUID,
} from "@/utils/helpers";
import { log } from "@/utils/logger";

export class RoomManager {
  private static instance: RoomManager;

  public static getInstance(): RoomManager {
    if (!RoomManager.instance) {
      RoomManager.instance = new RoomManager();
    }
    return RoomManager.instance;
  }

  private constructor() {}

  /**
   * Create a new room with the given master and settings
   */
  public async createRoom(
    masterId: string,
    settings: RoomSettings
  ): Promise<string> {
    if (!isValidUUID(masterId)) {
      throw new Error(`Invalid master ID: ${masterId}`);
    }

    // Check if master already has an active room
    const existingRoomId = await redis.client.get(
      REDIS_KEYS.ROOM_MASTER(masterId)
    );
    if (existingRoomId) {
      const existingRoom = await this.getRoom(existingRoomId);
      if (existingRoom && existingRoom.status === "active") {
        throw new Error(
          `Master ${masterId} already has an active room: ${existingRoomId}`
        );
      }
    }

    const roomId = generateRoomId();
    const now = formatTimestamp();

    const room: Room = {
      roomId,
      masterId,
      status: "active",
      createdAt: now,
      lastActivity: now,
      settings,
      statistics: {
        totalTasks: 0,
        completedTasks: 0,
        failedTasks: 0,
        activeTasks: 0,
        averageTaskDuration: 0,
        totalPixelsPlaced: 0,
        connectedSlaves: 0,
        uptime: 0,
      },
    };

    // Store room data
    await Promise.all([
      redis.client.hset(REDIS_KEYS.ROOM(roomId), this.roomToRedisHash(room)),
      redis.client.set(REDIS_KEYS.ROOM_MASTER(masterId), roomId),
      redis.client.sadd(REDIS_KEYS.ACTIVE_ROOMS, roomId),
      redis.client.expire(REDIS_KEYS.ROOM(roomId), 24 * 60 * 60), // 24 hour TTL
      redis.client.expire(REDIS_KEYS.ROOM_MASTER(masterId), 24 * 60 * 60),
    ]);

    log.room.created(
      roomId,
      masterId,
      settings as unknown as Record<string, unknown>
    );

    return roomId;
  }

  /**
   * Get room information by ID
   */
  public async getRoom(roomId: string): Promise<Room | null> {
    if (!isValidRoomId(roomId)) {
      return null;
    }

    const roomData = await redis.client.hgetall(REDIS_KEYS.ROOM(roomId));

    if (!roomData || Object.keys(roomData).length === 0) {
      return null;
    }

    return this.redisHashToRoom(roomData);
  }

  /**
   * Add a slave to a room
   */
  public async addSlaveToRoom(roomId: string, slaveId: string): Promise<void> {
    if (!isValidRoomId(roomId) || !isValidUUID(slaveId)) {
      throw new Error(`Invalid room ID or slave ID: ${roomId}, ${slaveId}`);
    }

    const room = await this.getRoom(roomId);
    if (!room) {
      throw new Error(`Room not found: ${roomId}`);
    }

    if (room.status !== "active") {
      throw new Error(`Room is not active: ${roomId}`);
    }

    // Check if room is full
    const currentSlaveCount = await redis.client.scard(
      REDIS_KEYS.ROOM_SLAVES(roomId)
    );
    if (
      room.settings.maxSlaves &&
      currentSlaveCount >= room.settings.maxSlaves
    ) {
      throw new Error(`Room is full: ${roomId}`);
    }

    // Check if slave is already in a room
    const existingRooms = await redis.client.keys(`room:*:slaves`);
    for (const key of existingRooms) {
      const isMember = await redis.client.sismember(key, slaveId);
      if (isMember) {
        const existingRoomId = key.split(":")[1];
        if (existingRoomId !== roomId) {
          throw new Error(
            `Slave ${slaveId} is already in room ${existingRoomId}`
          );
        }
      }
    }

    const slaveInfo: SlaveInfo = {
      slaveId,
      slaveName: undefined,
      connectedAt: formatTimestamp(),
      currentTask: undefined,
      statistics: {
        tasksCompleted: 0,
        tasksFailed: 0,
        pixelsPlaced: 0,
        averageDuration: 0,
      },
    };

    // Add slave to room
    await Promise.all([
      redis.client.sadd(REDIS_KEYS.ROOM_SLAVES(roomId), slaveId),
      redis.client.hset(
        REDIS_KEYS.ROOM_SLAVES(roomId) + `:${slaveId}`,
        this.slaveInfoToRedisHash(slaveInfo)
      ),
      this.updateRoomActivity(roomId),
    ]);

    // Update room statistics
    await this.updateRoomStatistics(roomId, {
      connectedSlaves: currentSlaveCount + 1,
    });

    // Publish slave join event
    await redis.client.publish(
      REDIS_CHANNELS.ROOM(roomId),
      JSON.stringify({
        type: "slave_joined",
        roomId,
        slaveId,
        timestamp: formatTimestamp(),
      })
    );

    log.room.joined(roomId, slaveId);
  }

  /**
   * Remove a slave from a room
   */
  public async removeSlaveFromRoom(
    roomId: string,
    slaveId: string
  ): Promise<void> {
    if (!isValidRoomId(roomId) || !isValidUUID(slaveId)) {
      throw new Error(`Invalid room ID or slave ID: ${roomId}, ${slaveId}`);
    }

    const isMember = await redis.client.sismember(
      REDIS_KEYS.ROOM_SLAVES(roomId),
      slaveId
    );
    if (!isMember) {
      return; // Slave not in room, nothing to do
    }

    // Remove slave from room
    await Promise.all([
      redis.client.srem(REDIS_KEYS.ROOM_SLAVES(roomId), slaveId),
      redis.client.del(REDIS_KEYS.ROOM_SLAVES(roomId) + `:${slaveId}`),
      this.updateRoomActivity(roomId),
    ]);

    // Update room statistics
    const newSlaveCount = await redis.client.scard(
      REDIS_KEYS.ROOM_SLAVES(roomId)
    );
    await this.updateRoomStatistics(roomId, { connectedSlaves: newSlaveCount });

    // Publish slave leave event
    await redis.client.publish(
      REDIS_CHANNELS.ROOM(roomId),
      JSON.stringify({
        type: "slave_left",
        roomId,
        slaveId,
        timestamp: formatTimestamp(),
      })
    );

    log.room.left(roomId, slaveId, "slave");
  }

  /**
   * Get all slaves in a room
   */
  public async getRoomSlaves(roomId: string): Promise<SlaveInfo[]> {
    if (!isValidRoomId(roomId)) {
      return [];
    }

    const slaveIds = await redis.client.smembers(
      REDIS_KEYS.ROOM_SLAVES(roomId)
    );
    const slaves: SlaveInfo[] = [];

    for (const slaveId of slaveIds) {
      const slaveData = await redis.client.hgetall(
        REDIS_KEYS.ROOM_SLAVES(roomId) + `:${slaveId}`
      );
      if (slaveData && Object.keys(slaveData).length > 0) {
        slaves.push(this.redisHashToSlaveInfo(slaveData));
      }
    }

    return slaves;
  }

  /**
   * Update room activity timestamp
   */
  public async updateRoomActivity(roomId: string): Promise<void> {
    if (!isValidRoomId(roomId)) {
      return;
    }

    await redis.client.hset(
      REDIS_KEYS.ROOM(roomId),
      "lastActivity",
      formatTimestamp()
    );
  }

  /**
   * Update room statistics
   */
  public async updateRoomStatistics(
    roomId: string,
    updates: Partial<RoomStatistics>
  ): Promise<void> {
    if (!isValidRoomId(roomId)) {
      return;
    }

    const updateHash: Record<string, string> = {};

    for (const [key, value] of Object.entries(updates)) {
      updateHash[`statistics.${key}`] = String(value);
    }

    if (Object.keys(updateHash).length > 0) {
      await redis.client.hset(REDIS_KEYS.ROOM(roomId), updateHash);
    }
  }

  /**
   * Deactivate a room
   */
  public async deactivateRoom(roomId: string): Promise<void> {
    if (!isValidRoomId(roomId)) {
      throw new Error(`Invalid room ID: ${roomId}`);
    }

    const room = await this.getRoom(roomId);
    if (!room) {
      throw new Error(`Room not found: ${roomId}`);
    }

    // Remove all slaves from the room
    const slaveIds = await redis.client.smembers(
      REDIS_KEYS.ROOM_SLAVES(roomId)
    );
    for (const slaveId of slaveIds) {
      await this.removeSlaveFromRoom(roomId, slaveId);
    }

    // Update room status
    await Promise.all([
      redis.client.hset(REDIS_KEYS.ROOM(roomId), "status", "inactive"),
      redis.client.srem(REDIS_KEYS.ACTIVE_ROOMS, roomId),
      redis.client.del(REDIS_KEYS.ROOM_MASTER(room.masterId)),
    ]);

    // Publish room deactivated event
    await redis.client.publish(
      REDIS_CHANNELS.ROOM(roomId),
      JSON.stringify({
        type: "room_deactivated",
        roomId,
        timestamp: formatTimestamp(),
      })
    );

    log.room.deleted(roomId, "manual");
  }

  /**
   * Get all active rooms
   */
  public async getActiveRooms(): Promise<Room[]> {
    const roomIds = await redis.client.smembers(REDIS_KEYS.ACTIVE_ROOMS);
    const rooms: Room[] = [];

    for (const roomId of roomIds) {
      const room = await this.getRoom(roomId);
      if (room && room.status === "active") {
        rooms.push(room);
      }
    }

    return rooms;
  }

  /**
   * Find room by master ID
   */
  public async findRoomByMaster(masterId: string): Promise<Room | null> {
    if (!isValidUUID(masterId)) {
      return null;
    }

    const roomId = await redis.client.get(REDIS_KEYS.ROOM_MASTER(masterId));
    if (!roomId) {
      return null;
    }

    return this.getRoom(roomId);
  }

  /**
   * Find room by slave ID
   */
  public async findRoomBySlave(slaveId: string): Promise<Room | null> {
    if (!isValidUUID(slaveId)) {
      return null;
    }

    const roomKeys = await redis.client.keys(`room:*:slaves`);

    for (const key of roomKeys) {
      const isMember = await redis.client.sismember(key, slaveId);
      if (isMember) {
        const roomId = key.split(":")[1];
        if (roomId) {
          return this.getRoom(roomId);
        }
      }
    }

    return null;
  }

  /**
   * Cleanup inactive rooms
   */
  public async cleanupInactiveRooms(): Promise<void> {
    const allRoomIds = await redis.client.smembers(REDIS_KEYS.ACTIVE_ROOMS);
    const cutoffTime = Date.now() - 60 * 60 * 1000; // 1 hour ago

    for (const roomId of allRoomIds) {
      const room = await this.getRoom(roomId);
      if (!room) {
        await redis.client.srem(REDIS_KEYS.ACTIVE_ROOMS, roomId);
        continue;
      }

      const lastActivity = new Date(room.lastActivity).getTime();
      if (lastActivity < cutoffTime) {
        log.room.deleted(roomId, "cleanup");
        await this.deactivateRoom(roomId);
      }
    }
  }

  /**
   * Convert room object to Redis hash format
   */
  private roomToRedisHash(room: Room): Record<string, string> {
    return {
      roomId: room.roomId,
      masterId: room.masterId,
      status: room.status,
      createdAt: room.createdAt,
      lastActivity: room.lastActivity,
      "settings.taskSize": room.settings.taskSize,
      "settings.taskTimeout": String(room.settings.taskTimeout),
      "settings.description": room.settings.description || "",
      "settings.maxSlaves": String(room.settings.maxSlaves || 0),
      "settings.autoCleanup": String(room.settings.autoCleanup),
      "statistics.totalTasks": String(room.statistics.totalTasks),
      "statistics.completedTasks": String(room.statistics.completedTasks),
      "statistics.failedTasks": String(room.statistics.failedTasks),
      "statistics.activeTasks": String(room.statistics.activeTasks),
      "statistics.averageTaskDuration": String(
        room.statistics.averageTaskDuration
      ),
      "statistics.totalPixelsPlaced": String(room.statistics.totalPixelsPlaced),
      "statistics.connectedSlaves": String(room.statistics.connectedSlaves),
      "statistics.uptime": String(room.statistics.uptime),
    };
  }

  /**
   * Convert Redis hash to room object
   */
  private redisHashToRoom(hash: Record<string, string>): Room {
    return {
      roomId: hash.roomId || "",
      masterId: hash.masterId || "",
      status: (hash.status as "active" | "inactive") || "inactive",
      createdAt: hash.createdAt || "",
      lastActivity: hash.lastActivity || "",
      settings: {
        taskSize:
          (hash["settings.taskSize"] as "1x1" | "3x3" | "5x5" | "10x10") ||
          "1x1",
        taskTimeout: parseInt(hash["settings.taskTimeout"] || "30000", 10),
        description: hash["settings.description"] || undefined,
        maxSlaves: parseInt(hash["settings.maxSlaves"] || "0", 10) || undefined,
        autoCleanup: (hash["settings.autoCleanup"] || "true") === "true",
      },
      statistics: {
        totalTasks: parseInt(hash["statistics.totalTasks"] || "0", 10),
        completedTasks: parseInt(hash["statistics.completedTasks"] || "0", 10),
        failedTasks: parseInt(hash["statistics.failedTasks"] || "0", 10),
        activeTasks: parseInt(hash["statistics.activeTasks"] || "0", 10),
        averageTaskDuration: parseFloat(
          hash["statistics.averageTaskDuration"] || "0"
        ),
        totalPixelsPlaced: parseInt(
          hash["statistics.totalPixelsPlaced"] || "0",
          10
        ),
        connectedSlaves: parseInt(
          hash["statistics.connectedSlaves"] || "0",
          10
        ),
        uptime: parseInt(hash["statistics.uptime"] || "0", 10),
      },
    };
  }

  /**
   * Convert slave info to Redis hash format
   */
  private slaveInfoToRedisHash(slaveInfo: SlaveInfo): Record<string, string> {
    return {
      slaveId: slaveInfo.slaveId,
      slaveName: slaveInfo.slaveName || "",
      connectedAt: slaveInfo.connectedAt,
      "currentTask.taskId": slaveInfo.currentTask?.taskId || "",
      "currentTask.assignedAt": slaveInfo.currentTask?.assignedAt || "",
      "currentTask.timeout": slaveInfo.currentTask?.timeout || "",
      "statistics.tasksCompleted": String(slaveInfo.statistics.tasksCompleted),
      "statistics.tasksFailed": String(slaveInfo.statistics.tasksFailed),
      "statistics.pixelsPlaced": String(slaveInfo.statistics.pixelsPlaced),
      "statistics.averageDuration": String(
        slaveInfo.statistics.averageDuration
      ),
    };
  }

  /**
   * Convert Redis hash to slave info object
   */
  private redisHashToSlaveInfo(hash: Record<string, string>): SlaveInfo {
    return {
      slaveId: hash.slaveId || "",
      slaveName: hash.slaveName || undefined,
      connectedAt: hash.connectedAt || "",
      currentTask: hash["currentTask.taskId"]
        ? {
            taskId: hash["currentTask.taskId"],
            assignedAt: hash["currentTask.assignedAt"] || "",
            timeout: hash["currentTask.timeout"] || "",
          }
        : undefined,
      statistics: {
        tasksCompleted: parseInt(hash["statistics.tasksCompleted"] || "0", 10),
        tasksFailed: parseInt(hash["statistics.tasksFailed"] || "0", 10),
        pixelsPlaced: parseInt(hash["statistics.pixelsPlaced"] || "0", 10),
        averageDuration: parseFloat(hash["statistics.averageDuration"] || "0"),
      },
    };
  }
}
