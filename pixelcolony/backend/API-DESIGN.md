# PixelColony Backend API Design

## WebSocket API Specification

### Connection Endpoint

```
ws://localhost:8080/pixelcolony
```

### Message Protocol Version

```
v1
```

### Message Format

All messages follow this structure:

```typescript
interface BaseMessage {
  type: string;
  version: string;
  timestamp: string;
  id: string; // Message ID for tracking
  data: any; // Message-specific payload
}
```

## Message Types

### 1. Room Management Messages

#### Create Room (Master → Server)

```typescript
interface CreateRoomMessage extends BaseMessage {
  type: "room_create";
  data: {
    masterId: string; // UUIDv4
    settings: {
      taskSize: "1x1" | "3x3" | "5x5" | "10x10";
      taskTimeout: number; // milliseconds
      description?: string;
      maxSlaves?: number;
    };
  };
}
```

#### Room Created (Server → Master)

```typescript
interface RoomCreatedMessage extends BaseMessage {
  type: "room_created";
  data: {
    roomId: string; // 8-char alphanumeric
    masterId: string;
    settings: RoomSettings;
    createdAt: string;
  };
}
```

#### Join Room (Slave → Server)

```typescript
interface JoinRoomMessage extends BaseMessage {
  type: "room_join";
  data: {
    roomId: string;
    slaveId: string; // UUIDv4
    slaveName?: string;
  };
}
```

#### Room Joined (Server → Slave)

```typescript
interface RoomJoinedMessage extends BaseMessage {
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
```

#### Leave Room (Master/Slave → Server)

```typescript
interface LeaveRoomMessage extends BaseMessage {
  type: "room_leave";
  data: {
    roomId: string;
    userId: string; // masterId or slaveId
  };
}
```

### 2. Task Management Messages

#### Create Tasks (Master → Server)

```typescript
interface CreateTasksMessage extends BaseMessage {
  type: "tasks_create";
  data: {
    roomId: string;
    masterId: string;
    tasks: TaskDefinition[];
  };
}

interface TaskDefinition {
  coordinates: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  pixels: PixelData[];
  priority?: number;
}

interface PixelData {
  x: number;
  y: number;
  colorId: number;
}
```

#### Tasks Created (Server → Room)

```typescript
interface TasksCreatedMessage extends BaseMessage {
  type: "tasks_created";
  data: {
    roomId: string;
    taskIds: string[];
    totalTasks: number;
  };
}
```

#### Claim Task (Slave → Server)

```typescript
interface ClaimTaskMessage extends BaseMessage {
  type: "task_claim";
  data: {
    roomId: string;
    slaveId: string;
  };
}
```

#### Task Claimed (Server → Slave)

```typescript
interface TaskClaimedMessage extends BaseMessage {
  type: "task_claimed";
  data: {
    taskId: string;
    roomId: string;
    slaveId: string;
    task: TaskData;
    timeout: number; // milliseconds
  };
}

interface TaskData {
  coordinates: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  pixels: PixelData[];
  createdAt: string;
  assignedAt: string;
}
```

#### No Tasks Available (Server → Slave)

```typescript
interface NoTasksMessage extends BaseMessage {
  type: "no_tasks";
  data: {
    roomId: string;
    slaveId: string;
    reason: "queue_empty" | "max_tasks_reached";
  };
}
```

#### Complete Task (Slave → Server)

```typescript
interface CompleteTaskMessage extends BaseMessage {
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
```

#### Task Completed (Server → Room)

```typescript
interface TaskCompletedMessage extends BaseMessage {
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
```

### 3. Status and Monitoring Messages

#### Room Status Update (Server → Room)

```typescript
interface RoomStatusMessage extends BaseMessage {
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

interface RoomStatistics {
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  activeTasks: number;
  averageTaskDuration: number;
  totalPixelsPlaced: number;
  connectedSlaves: number;
  uptime: number; // milliseconds
}

interface SlaveInfo {
  slaveId: string;
  slaveName?: string;
  connectedAt: string;
  currentTask?: {
    taskId: string;
    assignedAt: string;
    timeout: string;
  };
  statistics: {
    tasksCompleted: number;
    tasksFailed: number;
    pixelsPlaced: number;
    averageDuration: number;
  };
}
```

#### Heartbeat (Client ↔ Server)

```typescript
interface HeartbeatMessage extends BaseMessage {
  type: "heartbeat";
  data: {
    userId: string;
    roomId?: string;
  };
}

interface HeartbeatResponseMessage extends BaseMessage {
  type: "heartbeat_response";
  data: {
    serverTime: string;
    roomActive: boolean;
  };
}
```

### 4. Error Messages

#### Error Response (Server → Client)

```typescript
interface ErrorMessage extends BaseMessage {
  type: "error";
  data: {
    code: string;
    message: string;
    details?: any;
    requestId?: string; // Original message ID that caused error
  };
}
```

#### Error Codes

```typescript
enum ErrorCodes {
  ROOM_NOT_FOUND = "ROOM_NOT_FOUND",
  ROOM_FULL = "ROOM_FULL",
  INVALID_MASTER = "INVALID_MASTER",
  TASK_NOT_FOUND = "TASK_NOT_FOUND",
  TASK_ALREADY_ASSIGNED = "TASK_ALREADY_ASSIGNED",
  INVALID_MESSAGE_FORMAT = "INVALID_MESSAGE_FORMAT",
  AUTHENTICATION_FAILED = "AUTHENTICATION_FAILED",
  RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED",
  INTERNAL_SERVER_ERROR = "INTERNAL_SERVER_ERROR",
}
```

## Data Models

### Room Data Structure

```typescript
interface Room {
  roomId: string; // 8-char alphanumeric
  masterId: string;
  status: "active" | "inactive";
  createdAt: string;
  lastActivity: string;
  settings: RoomSettings;
  statistics: RoomStatistics;
}

interface RoomSettings {
  taskSize: "1x1" | "3x3" | "5x5" | "10x10";
  taskTimeout: number; // milliseconds
  description?: string;
  maxSlaves?: number;
  autoCleanup: boolean;
}
```

### Task Data Structure

```typescript
interface Task {
  taskId: string; // UUIDv4
  roomId: string;
  status: "todo" | "in_progress" | "completed" | "failed" | "timeout";
  coordinates: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  pixels: PixelData[];
  assignedTo?: string; // slaveId
  createdAt: string;
  assignedAt?: string;
  completedAt?: string;
  timeout: number; // milliseconds
  priority: number;
  retryCount: number;
}
```

### Connection Data Structure

```typescript
interface Connection {
  connectionId: string;
  userId: string; // masterId or slaveId
  userType: "master" | "slave";
  roomId?: string;
  connectedAt: string;
  lastHeartbeat: string;
  ipAddress: string;
  userAgent: string;
}
```

## Redis Data Schema

### Keys Structure

```
# Rooms
room:{roomId} -> Room JSON
room:{roomId}:slaves -> Set of slaveIds
room:master:{masterId} -> roomId

# Tasks
task:{taskId} -> Task JSON
room:{roomId}:tasks:todo -> List of taskIds
room:{roomId}:tasks:in_progress -> Set of taskIds
room:{roomId}:tasks:completed -> Set of taskIds
room:{roomId}:tasks:failed -> Set of taskIds

# Connections
connection:{connectionId} -> Connection JSON
user:{userId}:connection -> connectionId
room:{roomId}:connections -> Set of connectionIds

# Statistics
room:{roomId}:stats -> RoomStatistics JSON
slave:{slaveId}:stats -> SlaveStatistics JSON

# Pub/Sub Channels
room:{roomId} -> Room-specific channel
room:{roomId}:master -> Master-only channel
global -> Global notifications
```

### Redis Operations

#### Room Management

```typescript
// Create Room
await redis.hset(`room:${roomId}`, room);
await redis.sadd("active_rooms", roomId);
await redis.set(`room:master:${masterId}`, roomId);

// Join Room
await redis.sadd(`room:${roomId}:slaves`, slaveId);
await redis.hset(`connection:${connectionId}`, connection);

// Room Cleanup
await redis.srem("active_rooms", roomId);
await redis.del(`room:${roomId}`);
await redis.del(`room:${roomId}:slaves`);
```

#### Task Management

```typescript
// Create Tasks
const taskIds = await redis.lpush(`room:${roomId}:tasks:todo`, ...taskIds);

// Claim Task
const taskId = await redis.brpoplpush(
  `room:${roomId}:tasks:todo`,
  `room:${roomId}:tasks:in_progress`,
  10 // timeout in seconds
);

// Complete Task
await redis.srem(`room:${roomId}:tasks:in_progress`, taskId);
await redis.sadd(`room:${roomId}:tasks:completed`, taskId);
```

## HTTP API Endpoints (Optional)

### Health and Status

```
GET /health
GET /rooms/{roomId}/status
GET /rooms/{roomId}/tasks
GET /rooms/{roomId}/statistics
```

### Room Management (REST fallback)

```
POST /rooms (Create room)
GET /rooms/{roomId} (Get room info)
DELETE /rooms/{roomId} (Delete room - master only)
```

## Authentication Flow (Future V2)

### JWT Token Structure

```typescript
interface JWTPayload {
  userId: string;
  userType: "master" | "slave";
  roomId?: string;
  permissions: string[];
  iat: number;
  exp: number;
}
```

### Authentication Messages

```typescript
interface AuthenticateMessage extends BaseMessage {
  type: "authenticate";
  data: {
    token: string;
  };
}

interface AuthenticatedMessage extends BaseMessage {
  type: "authenticated";
  data: {
    userId: string;
    userType: "master" | "slave";
    permissions: string[];
  };
}
```

## Rate Limiting

### Rate Limit Configuration

```typescript
interface RateLimitConfig {
  roomCreation: {
    perHour: 10;
    perDay: 50;
  };
  taskCreation: {
    perMinute: 100;
    perHour: 5000;
  };
  roomJoining: {
    perMinute: 20;
    perHour: 200;
  };
  messagesSent: {
    perSecond: 10;
    perMinute: 300;
  };
}
```

### Rate Limit Response

```typescript
interface RateLimitMessage extends BaseMessage {
  type: "rate_limit";
  data: {
    operation: string;
    limit: number;
    remaining: number;
    resetTime: string;
  };
}
```

## Error Handling Strategies

### Connection Errors

- **Connection Lost**: Automatic reconnection with exponential backoff
- **Invalid Messages**: Send error response and maintain connection
- **Authentication Failed**: Close connection with error code
- **Rate Limit Exceeded**: Temporary connection throttling

### Task Processing Errors

- **Task Timeout**: Move task back to todo queue
- **Task Assignment Conflict**: Return "no tasks available"
- **Invalid Task Data**: Mark task as failed
- **Slave Disconnection**: Requeue assigned tasks

### Room Management Errors

- **Room Not Found**: Return error, don't create connection
- **Master Disconnection**: Keep room active, allow reconnection
- **Room Cleanup**: Gracefully disconnect all slaves
- **Capacity Exceeded**: Reject new connections with error

This API design provides a comprehensive foundation for the PixelColony backend service with clear message protocols, data structures, and error handling patterns.
