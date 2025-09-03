import { redis } from "@/redis/client";
import {
  REDIS_CHANNELS,
  REDIS_KEYS,
  Task,
  TaskDefinition,
  TaskStatistics,
  TaskStatus,
} from "@/types";
import {
  calculateDuration,
  formatTimestamp,
  generateTaskId,
  isValidRoomId,
  isValidUUID,
} from "@/utils/helpers";
import { log } from "@/utils/logger";

export class TaskManager {
  private static instance: TaskManager;

  public static getInstance(): TaskManager {
    if (!TaskManager.instance) {
      TaskManager.instance = new TaskManager();
    }
    return TaskManager.instance;
  }

  private constructor() {}

  /**
   * Create tasks for a given area and pixels
   */
  public async createTasks(
    roomId: string,
    tasksDefinitions: TaskDefinition[]
  ): Promise<string[]> {
    if (!isValidRoomId(roomId)) {
      throw new Error(`Invalid room ID: ${roomId}`);
    }

    if (!tasksDefinitions || tasksDefinitions.length === 0) {
      throw new Error("No tasks provided for creation");
    }

    const tasks: Task[] = [];
    const taskIds: string[] = [];

    for (const def of tasksDefinitions) {
      const taskId = generateTaskId();
      const task: Task = {
        taskId,
        roomId,
        status: "todo",
        coordinates: def.coordinates,
        pixels: def.pixels,
        createdAt: formatTimestamp(),
        timeout: Date.now() + 5 * 60 * 1000, // 5 minutes
        assignedTo: undefined,
        assignedAt: undefined,
        completedAt: undefined,
        priority: 1,
        retryCount: 0,
      };

      tasks.push(task);
      taskIds.push(taskId);
    }

    // Store tasks in Redis
    await Promise.all([
      // Store individual tasks
      ...tasks.map((task) =>
        redis.client.hset(
          REDIS_KEYS.TASK(task.taskId),
          this.taskToRedisHash(task)
        )
      ),
      // Add to todo queue
      redis.client.lpush(REDIS_KEYS.ROOM_TASKS_TODO(roomId), ...taskIds),
      // Set expiration for tasks
      ...tasks.map(
        (task) =>
          redis.client.expire(REDIS_KEYS.TASK(task.taskId), 24 * 60 * 60) // 24 hours
      ),
    ]);

    log.task.created(taskIds, roomId, tasksDefinitions.length);

    return taskIds;
  }

  /**
   * Assign a task to a slave
   */
  public async assignTask(
    roomId: string,
    slaveId: string
  ): Promise<Task | null> {
    if (!isValidRoomId(roomId) || !isValidUUID(slaveId)) {
      throw new Error(`Invalid room ID or slave ID: ${roomId}, ${slaveId}`);
    }

    // Get next available task from todo queue
    const taskId = await redis.client.rpop(REDIS_KEYS.ROOM_TASKS_TODO(roomId));

    if (!taskId) {
      return null; // No tasks available
    }

    // Get task details
    const task = await this.getTask(taskId);
    if (!task) {
      log.task.error(taskId, new Error("Task not found in Redis"), "assign");
      return null;
    }

    // Check if task is already assigned or in progress
    if (task.status !== "todo") {
      log.task.error(
        taskId,
        new Error(`Task already ${task.status}`),
        "assign"
      );
      return null;
    }

    const now = formatTimestamp();
    const timeoutDate = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes from now

    // Update task with assignment
    const updatedTask: Task = {
      ...task,
      status: "in_progress",
      assignedTo: slaveId,
      assignedAt: now,
      timeout: Date.now() + 30000, // 30 seconds default timeout
    };

    // Store updated task and move to in-progress queue
    await Promise.all([
      redis.client.hset(
        REDIS_KEYS.TASK(taskId),
        this.taskToRedisHash(updatedTask)
      ),
      redis.client.lpush(REDIS_KEYS.ROOM_TASKS_IN_PROGRESS(roomId), taskId),
    ]);

    // Publish task assignment event
    await redis.client.publish(
      REDIS_CHANNELS.ROOM(roomId),
      JSON.stringify({
        type: "task_assigned",
        roomId,
        taskId,
        slaveId,
        timestamp: now,
      })
    );

    log.task.claimed(taskId, roomId, slaveId);

    return updatedTask;
  }

  /**
   * Complete a task
   */
  public async completeTask(
    taskId: string,
    slaveId: string,
    results: { success: boolean; pixelsPlaced: number; failureReason?: string }
  ): Promise<void> {
    if (!isValidUUID(taskId) || !isValidUUID(slaveId)) {
      throw new Error(`Invalid task ID or slave ID: ${taskId}, ${slaveId}`);
    }

    const task = await this.getTask(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    if (task.assignedTo !== slaveId) {
      throw new Error(`Task ${taskId} is not assigned to slave ${slaveId}`);
    }

    if (task.status !== "in_progress") {
      throw new Error(`Task ${taskId} is not in progress: ${task.status}`);
    }

    const now = formatTimestamp();
    const duration = task.assignedAt
      ? calculateDuration(task.assignedAt, now)
      : 0;

    const updatedTask: Task = {
      ...task,
      status: results.success ? "completed" : "failed",
      completedAt: results.success ? now : undefined,
      failedAt: results.success ? undefined : now,
      failureReason: results.failureReason,
      statistics: {
        pixelsPlaced: results.pixelsPlaced,
        pixelsFailed: task.pixels.length - results.pixelsPlaced,
        averagePlacementTime:
          results.pixelsPlaced > 0 ? duration / results.pixelsPlaced : 0,
        totalTime: duration,
      },
    };

    // Store updated task and move to appropriate queue
    const targetQueue = results.success
      ? REDIS_KEYS.ROOM_TASKS_COMPLETED(task.roomId)
      : REDIS_KEYS.ROOM_TASKS_FAILED(task.roomId);

    await Promise.all([
      redis.client.hset(
        REDIS_KEYS.TASK(taskId),
        this.taskToRedisHash(updatedTask)
      ),
      redis.client.lrem(
        REDIS_KEYS.ROOM_TASKS_IN_PROGRESS(task.roomId),
        0,
        taskId
      ),
      redis.client.lpush(targetQueue, taskId),
    ]);

    // Publish task completion event
    await redis.client.publish(
      REDIS_CHANNELS.ROOM(task.roomId),
      JSON.stringify({
        type: results.success ? "task_completed" : "task_failed",
        roomId: task.roomId,
        taskId,
        slaveId,
        results,
        timestamp: now,
      })
    );

    log.task.completed(
      taskId,
      task.roomId,
      slaveId,
      updatedTask.status,
      duration
    );
  }

  /**
   * Fail a task (timeout or error)
   */
  public async failTask(taskId: string, reason: string): Promise<void> {
    if (!isValidUUID(taskId)) {
      throw new Error(`Invalid task ID: ${taskId}`);
    }

    const task = await this.getTask(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    const now = formatTimestamp();
    const updatedTask: Task = {
      ...task,
      status: "failed",
      failedAt: now,
      failureReason: reason,
      retryCount: task.retryCount + 1,
    };

    // Check if task should be retried
    const shouldRetry = task.retryCount < 3; // Max 3 retries

    if (shouldRetry) {
      // Reset task for retry
      updatedTask.status = "todo";
      updatedTask.assignedTo = undefined;
      updatedTask.assignedAt = undefined;
      updatedTask.failedAt = undefined;
      updatedTask.timeout = Date.now() + 5 * 60 * 1000; // 5 minutes as timestamp
    }

    const targetQueue = shouldRetry
      ? REDIS_KEYS.ROOM_TASKS_TODO(task.roomId)
      : REDIS_KEYS.ROOM_TASKS_FAILED(task.roomId);

    // Update task and move to appropriate queue
    await Promise.all([
      redis.client.hset(
        REDIS_KEYS.TASK(taskId),
        this.taskToRedisHash(updatedTask)
      ),
      redis.client.lrem(
        REDIS_KEYS.ROOM_TASKS_IN_PROGRESS(task.roomId),
        0,
        taskId
      ),
      shouldRetry
        ? redis.client.lpush(targetQueue, taskId)
        : redis.client.lpush(targetQueue, taskId),
    ]);

    // Publish event
    await redis.client.publish(
      REDIS_CHANNELS.ROOM(task.roomId),
      JSON.stringify({
        type: shouldRetry ? "task_retried" : "task_failed",
        roomId: task.roomId,
        taskId,
        reason,
        retryCount: updatedTask.retryCount,
        timestamp: now,
      })
    );

    log.task.error(taskId, new Error(reason), "failTask");
  }

  /**
   * Get a task by ID
   */
  public async getTask(taskId: string): Promise<Task | null> {
    if (!isValidUUID(taskId)) {
      return null;
    }

    const taskData = await redis.client.hgetall(REDIS_KEYS.TASK(taskId));

    if (!taskData || Object.keys(taskData).length === 0) {
      return null;
    }

    return this.redisHashToTask(taskData);
  }

  /**
   * Get all tasks for a room by status
   */
  public async getRoomTasks(
    roomId: string,
    status?: TaskStatus
  ): Promise<Task[]> {
    if (!isValidRoomId(roomId)) {
      return [];
    }

    let taskIds: string[] = [];

    if (status) {
      // Get tasks from specific queue
      const queueKey = this.getQueueKeyForStatus(roomId, status);
      taskIds = await redis.client.lrange(queueKey, 0, -1);
    } else {
      // Get all tasks from all queues
      const [todo, inProgress, completed, failed] = await Promise.all([
        redis.client.lrange(REDIS_KEYS.ROOM_TASKS_TODO(roomId), 0, -1),
        redis.client.lrange(REDIS_KEYS.ROOM_TASKS_IN_PROGRESS(roomId), 0, -1),
        redis.client.lrange(REDIS_KEYS.ROOM_TASKS_COMPLETED(roomId), 0, -1),
        redis.client.lrange(REDIS_KEYS.ROOM_TASKS_FAILED(roomId), 0, -1),
      ]);
      taskIds = [...todo, ...inProgress, ...completed, ...failed];
    }

    // Fetch task details
    const tasks: Task[] = [];
    for (const taskId of taskIds) {
      const task = await this.getTask(taskId);
      if (task) {
        tasks.push(task);
      }
    }

    return tasks;
  }

  /**
   * Get room task statistics
   */
  public async getRoomTaskStatistics(roomId: string): Promise<TaskStatistics> {
    if (!isValidRoomId(roomId)) {
      throw new Error(`Invalid room ID: ${roomId}`);
    }

    const [todoCount, inProgressCount, completedCount, failedCount] =
      await Promise.all([
        redis.client.llen(REDIS_KEYS.ROOM_TASKS_TODO(roomId)),
        redis.client.llen(REDIS_KEYS.ROOM_TASKS_IN_PROGRESS(roomId)),
        redis.client.llen(REDIS_KEYS.ROOM_TASKS_COMPLETED(roomId)),
        redis.client.llen(REDIS_KEYS.ROOM_TASKS_FAILED(roomId)),
      ]);

    // Get completed tasks for timing statistics
    const completedTaskIds = await redis.client.lrange(
      REDIS_KEYS.ROOM_TASKS_COMPLETED(roomId),
      0,
      99
    ); // Last 100
    let totalDuration = 0;
    let totalPixels = 0;
    let taskCount = 0;

    for (const taskId of completedTaskIds) {
      const task = await this.getTask(taskId);
      if (task && task.statistics) {
        totalDuration += task.statistics.totalTime;
        totalPixels += task.statistics.pixelsPlaced;
        taskCount++;
      }
    }

    const averageTimePerTask = taskCount > 0 ? totalDuration / taskCount : 0;
    const tasksPerMinute =
      averageTimePerTask > 0 ? 60000 / averageTimePerTask : 0; // Convert ms to minutes

    return {
      totalTasks: todoCount + inProgressCount + completedCount + failedCount,
      assignedTasks: inProgressCount,
      completedTasks: completedCount,
      averageTimePerTask,
      tasksPerMinute,
    };
  }

  /**
   * Clean up expired tasks
   */
  public async cleanupExpiredTasks(): Promise<void> {
    const rooms = await redis.client.smembers(REDIS_KEYS.ACTIVE_ROOMS);

    for (const roomId of rooms) {
      const inProgressTaskIds = await redis.client.lrange(
        REDIS_KEYS.ROOM_TASKS_IN_PROGRESS(roomId),
        0,
        -1
      );

      for (const taskId of inProgressTaskIds) {
        const task = await this.getTask(taskId);

        if (task && task.timeout < Date.now()) {
          log.task.timeout(taskId, roomId, task.assignedTo || "unknown");
          await this.failTask(taskId, "Task timeout");
        }
      }
    }
  }

  /**
   * Get Redis queue key for task status
   */
  private getQueueKeyForStatus(roomId: string, status: TaskStatus): string {
    switch (status) {
      case "todo":
        return REDIS_KEYS.ROOM_TASKS_TODO(roomId);
      case "in_progress":
        return REDIS_KEYS.ROOM_TASKS_IN_PROGRESS(roomId);
      case "completed":
        return REDIS_KEYS.ROOM_TASKS_COMPLETED(roomId);
      case "failed":
        return REDIS_KEYS.ROOM_TASKS_FAILED(roomId);
      default:
        throw new Error(`Unknown task status: ${status}`);
    }
  }

  /**
   * Convert task object to Redis hash format
   */
  private taskToRedisHash(task: Task): Record<string, string> {
    return {
      taskId: task.taskId,
      roomId: task.roomId,
      status: task.status,
      coordinates: JSON.stringify(task.coordinates),
      pixels: JSON.stringify(task.pixels),
      createdAt: task.createdAt,
      timeout: String(task.timeout),
      priority: String(task.priority),
      assignedTo: task.assignedTo || "",
      assignedAt: task.assignedAt || "",
      completedAt: task.completedAt || "",
      failedAt: task.failedAt || "",
      failureReason: task.failureReason || "",
      retryCount: String(task.retryCount),
      "statistics.pixelsPlaced": String(task.statistics?.pixelsPlaced || 0),
      "statistics.pixelsFailed": String(task.statistics?.pixelsFailed || 0),
      "statistics.averagePlacementTime": String(
        task.statistics?.averagePlacementTime || 0
      ),
      "statistics.totalTime": String(task.statistics?.totalTime || 0),
    };
  }

  /**
   * Convert Redis hash to task object
   */
  private redisHashToTask(hash: Record<string, string>): Task {
    return {
      taskId: hash.taskId || "",
      roomId: hash.roomId || "",
      status: (hash.status as TaskStatus) || "todo",
      coordinates: JSON.parse(hash.coordinates || '{"x":0,"y":0}'),
      pixels: JSON.parse(hash.pixels || "[]"),
      createdAt: hash.createdAt || "",
      timeout: parseInt(hash.timeout || "0", 10),
      assignedTo: hash.assignedTo || undefined,
      assignedAt: hash.assignedAt || undefined,
      completedAt: hash.completedAt || undefined,
      failedAt: hash.failedAt || undefined,
      failureReason: hash.failureReason || undefined,
      priority: parseInt(hash.priority || "0", 10),
      retryCount: parseInt(hash.retryCount || "0", 10),
      statistics: {
        pixelsPlaced: parseInt(hash["statistics.pixelsPlaced"] || "0", 10),
        pixelsFailed: parseInt(hash["statistics.pixelsFailed"] || "0", 10),
        averagePlacementTime: parseFloat(
          hash["statistics.averagePlacementTime"] || "0"
        ),
        totalTime: parseFloat(hash["statistics.totalTime"] || "0"),
      },
    };
  }
}
