# PixelColony - Multi-Bot Collaborative Feature Instructions

## Project Overview

PixelColony is a major feature extension for WPlace AutoBOT that transforms the current single-bot operation (1 print → 1 bot) into a collaborative multi-bot system (1 print → N bots). This allows multiple bots to work together on the same image painting task through a room-based architecture with master-slave coordination.

## Feature Description

### Current State

- **Solo Mode**: One print operation handled by one bot in one browser with one account
- **Single-File Architecture**: Auto-Image.js runs as injected JavaScript bookmarklet
- **Individual Operation**: Each bot operates independently

### Target State

- **Collaborative Mode**: One print operation distributed across N bots (N browsers, N accounts)
- **Room-Based Architecture**: Master creates rooms, slaves join to receive task assignments
- **Task Distribution**: Master breaks down image into smaller tasks that slaves execute in parallel
- **Backward Compatibility**: Solo mode remains available alongside collaborative mode

### Core Concepts

#### Room Architecture

- **Room Master**: Initial creator with full read/write permissions on room parameters
- **Room Slaves**: Participants with read-only access who execute assigned tasks
- **Room ID**: 8-character alphanumeric case-sensitive identifier (server-generated)
- **Room Lifecycle**:
  - Inactive after 1 hour of no task requests
  - Deleted after 24 hours of no activity
  - All bots disconnected on deletion

#### Task System

- **Task Definition**: Square pixel regions (1x1, 3x3, 5x5, or 10x10) with specific coordinates
- **Task States**: ToDo → InProgress → Done/Failed → (requeue if failed)
- **Task Assignment**: Slaves claim tasks atomically, one task per slave maximum
- **Task Timeout**: Configurable timeout causes automatic requeue to ToDo state
- **Task Execution**: Slaves use existing pixel painting algorithms on assigned regions

#### Bot Identification

- **Bot ID Format**: UUIDv4 generated per bot instance initialization
- **Master Reconnection**: Masters can reconnect with same ID to resume room control
- **Slave Identity**: Temporary identity, no persistence across sessions

## Technical Architecture

### Backend Service Stack

- **Runtime**: Node.js with TypeScript
- **WebSocket Server**: Native WebSocket or WS library for real-time communication
- **Message Broker**: Redis Pub/Sub for room-based message distribution
- **Data Persistence**: Redis with RDB/AOF for room state and task queues
- **Deployment**: Docker Compose with Redis and backend service containers

### Communication Protocol

- **Transport**: WebSocket for bidirectional real-time communication
- **Message Format**: JSON with standardized message types and protocol versioning
- **Channel Strategy**: Redis channels per room for isolated communication
- **Connection Management**: Automatic reconnection with exponential backoff

### Data Schema

#### Room Data Structure

```json
{
  "roomId": "8CHAR123",
  "masterId": "uuid-v4-string",
  "createdAt": "2025-01-01T00:00:00Z",
  "lastActivity": "2025-01-01T00:00:00Z",
  "status": "active|inactive",
  "settings": {
    "taskSize": "3x3",
    "taskTimeout": 300000,
    "description": "Room description"
  },
  "statistics": {
    "totalTasks": 100,
    "completedTasks": 25,
    "failedTasks": 2,
    "activeTasks": 5
  }
}
```

#### Task Data Structure

```json
{
  "taskId": "uuid-v4-string",
  "roomId": "8CHAR123",
  "status": "ToDo|InProgress|Done|Failed",
  "assignedTo": "slave-uuid-v4",
  "coordinates": {
    "x": 100,
    "y": 200,
    "width": 3,
    "height": 3
  },
  "pixels": [
    { "x": 100, "y": 200, "colorId": 5 },
    { "x": 101, "y": 200, "colorId": 7 }
  ],
  "createdAt": "2025-01-01T00:00:00Z",
  "assignedAt": "2025-01-01T00:00:00Z",
  "completedAt": null,
  "timeout": 300000
}
```

#### WebSocket Message Protocol

```json
{
  "type": "room_create|room_join|task_create|task_claim|task_complete|status_update",
  "version": "v1",
  "timestamp": "2025-01-01T00:00:00Z",
  "data": {
    // Message-specific payload
  }
}
```

### Frontend Integration

#### UI Components

- **Location**: New section in existing "Painting Control" panel
- **Components**:
  - Mode selector: Solo/Collaborative
  - Room creation button with settings
  - Room joining interface with ID input
  - Room status display
- **Statistics Display**: Enhanced "Painting Stats" panel showing:
  - Connected bots count
  - Task queue status
  - Progress distribution
  - Performance metrics

#### WebSocket Client Integration

- **Connection Management**: Automatic connection/reconnection to backend service
- **State Synchronization**: Real-time updates for room status and task progress
- **Error Handling**: Graceful degradation with fallback to solo mode
- **Message Handling**: Protocol-compliant message processing

### Compatibility and Migration

#### Solo Mode Preservation

- **Default Behavior**: Existing functionality unchanged
- **Mode Selection**: Users explicitly opt into collaborative mode
- **Code Isolation**: PixelColony features in separate modules/functions
- **Configuration**: Separate settings for collaborative vs solo operation

#### Existing Code Integration

- **Painting Algorithm Reuse**: Slaves execute same pixel placement logic
- **State Management**: Extend existing state object with collaborative properties
- **UI Framework**: Use existing CSS classes and UI patterns
- **Error Handling**: Leverage existing error handling and notification systems

## Implementation Phases

### Phase 1: Backend Foundation

1. **Service Architecture**: Set up Node.js TypeScript project structure
2. **WebSocket Server**: Implement basic WebSocket connection handling
3. **Redis Integration**: Configure Redis client for pub/sub and data persistence
4. **Room Management**: Create/join/list room operations
5. **Docker Setup**: Docker Compose configuration for development

### Phase 2: Protocol and Communication

1. **Message Protocol**: Define and implement WebSocket message standards
2. **Task System**: Task creation, assignment, completion workflows
3. **Real-time Updates**: Redis pub/sub for live room updates
4. **Connection Management**: Reconnection logic and connection state handling
5. **Error Handling**: Comprehensive error scenarios and recovery

### Phase 3: Frontend Integration

1. **UI Components**: PixelColony interface in Painting Control section
2. **WebSocket Client**: Frontend WebSocket connection and message handling
3. **State Integration**: Collaborative state management in existing bot
4. **Statistics Display**: Real-time room statistics in Painting Stats
5. **Mode Switching**: Toggle between solo and collaborative modes

### Phase 4: Collaborative Logic

1. **Master Implementation**: Task creation from image data
2. **Slave Implementation**: Task claiming and execution logic
3. **Progress Tracking**: Real-time progress updates and synchronization
4. **Performance Optimization**: Batch processing and efficient task distribution
5. **Testing**: Multi-bot scenario testing and validation

### Phase 5: Production Readiness

1. **Error Recovery**: Robust error handling and graceful degradation
2. **Performance Monitoring**: Metrics collection and performance optimization
3. **Documentation**: User guides and developer documentation
4. **Deployment**: Production deployment instructions and configurations
5. **Security**: Input validation and basic security measures

## Configuration and Settings

### Environment Variables

```bash
# Backend Service
REDIS_URL=redis://localhost:6379
WEBSOCKET_PORT=8080
LOG_LEVEL=info
ROOM_CLEANUP_INTERVAL=3600000
TASK_TIMEOUT_DEFAULT=300000

# Docker Compose
COMPOSE_PROJECT_NAME=pixelcolony
REDIS_PORT=6379
BACKEND_PORT=8080
```

### Room Settings (Configurable by Master)

- **Task Size**: 1x1, 3x3, 5x5, 10x10 pixels
- **Task Timeout**: 60-600 seconds (default 300)
- **Max Slaves**: 1-50 concurrent slaves (default unlimited)
- **Room Description**: Optional text description
- **Auto-Cleanup**: Enable/disable automatic room cleanup

### Bot Settings

- **Reconnection**: Automatic reconnection enabled by default
- **Heartbeat Interval**: 30 seconds WebSocket ping/pong
- **Connection Timeout**: 10 seconds initial connection timeout
- **Message Queue**: Local message queuing for offline/reconnection scenarios

## Security Considerations

### Authentication (V1)

- **No Authentication**: V1 implements no user authentication
- **Room Access**: Anyone with room ID can join
- **Rate Limiting**: Basic rate limiting on room creation and task assignment
- **Input Validation**: Comprehensive validation of all inputs

### Future Security Enhancements

- **User Authentication**: JWT-based authentication system
- **Room Permissions**: Private rooms with access control
- **Rate Limiting**: Advanced rate limiting and abuse prevention
- **Audit Logging**: Comprehensive activity logging and monitoring

## Development Guidelines

### Code Organization

```
pixelcolony/
├── backend/
│   ├── src/
│   │   ├── server.ts           # Main server entry point
│   │   ├── websocket/          # WebSocket handling
│   │   ├── rooms/              # Room management
│   │   ├── tasks/              # Task system
│   │   ├── redis/              # Redis integration
│   │   └── utils/              # Shared utilities
│   ├── docker/
│   │   └── Dockerfile
│   └── package.json
├── frontend/
│   ├── pixelcolony.js          # Main frontend integration
│   ├── websocket-client.js     # WebSocket client
│   ├── ui-components.js        # UI components
│   └── collaborative-state.js  # State management
├── docker-compose.yml
└── docs/
    ├── api.md                  # API documentation
    ├── deployment.md           # Deployment guide
    └── user-guide.md           # User guide
```

### Development Standards

- **TypeScript**: Strong typing throughout backend
- **Code Style**: ESLint + Prettier configuration
- **Testing**: Jest for unit/integration tests
- **Documentation**: JSDoc comments for all public APIs
- **Version Control**: Feature branch workflow with PR reviews

### Performance Targets

- **Connection Latency**: <100ms WebSocket connection establishment
- **Message Latency**: <50ms for room updates and task assignments
- **Throughput**: Support 100+ concurrent connections per room
- **Task Processing**: <1 second task assignment and status updates
- **Memory Usage**: <500MB total memory for backend service

## Monitoring and Observability

### Metrics Collection

- **Connection Metrics**: Active connections, connection duration, reconnection rates
- **Room Metrics**: Active rooms, room lifetime, task completion rates
- **Performance Metrics**: Message latency, task processing time, error rates
- **Resource Metrics**: Memory usage, CPU utilization, Redis performance

### Logging Strategy

- **Structured Logging**: JSON format with consistent field structure
- **Log Levels**: ERROR, WARN, INFO, DEBUG with appropriate distribution
- **Correlation IDs**: Track requests across room operations and task processing
- **Event Logging**: Audit trail for room creation, task assignment, completion

### Health Checks

- **Service Health**: HTTP endpoint for container orchestration
- **Redis Health**: Connection status and basic operations validation
- **WebSocket Health**: Connection count and message processing status
- **Task System Health**: Queue processing and timeout handling verification

## Deployment Instructions

### Development Environment

```bash
# Clone repository and navigate to PixelColony directory
cd pixelcolony/

# Start development environment
docker-compose up -d

# Backend logs
docker-compose logs -f backend

# Redis logs
docker-compose logs -f redis
```

### Production Deployment

```bash
# Production environment variables
export REDIS_URL=redis://production-redis:6379
export WEBSOCKET_PORT=8080
export NODE_ENV=production

# Deploy with production compose file
docker-compose -f docker-compose.prod.yml up -d

# Health check
curl http://localhost:8080/health
```

### Frontend Integration

```javascript
// Load PixelColony features into Auto-Image.js
// Add to existing bot initialization
if (window.location.hostname === "wplace.live") {
  // Initialize PixelColony client
  const pixelColony = new PixelColonyClient({
    backendUrl: "ws://localhost:8080",
    reconnectEnabled: true,
    heartbeatInterval: 30000,
  });

  // Integrate with existing bot state
  Object.assign(state, pixelColony.getInitialState());
}
```

## Testing Strategy

### Unit Tests

- **Room Management**: Room creation, joining, leaving, cleanup
- **Task System**: Task creation, assignment, completion, timeout handling
- **WebSocket Protocol**: Message parsing, validation, error handling
- **Redis Operations**: Data persistence, pub/sub messaging, connection handling

### Integration Tests

- **End-to-End Workflows**: Complete room creation to task completion cycles
- **Multi-Bot Scenarios**: Master with multiple slaves coordination
- **Failure Scenarios**: Network interruptions, service restarts, slave disconnections
- **Performance Tests**: High load testing with many concurrent connections

### Manual Testing Scenarios

1. **Basic Flow**: Create room → Join room → Create tasks → Execute tasks
2. **Master Disconnect**: Master leaves and rejoins room
3. **Slave Disconnect**: Slave disconnects during task execution
4. **Room Cleanup**: Verify automatic room cleanup after inactivity
5. **Task Timeout**: Verify task requeue after timeout
6. **Concurrent Access**: Multiple slaves claiming tasks simultaneously

## Future Enhancements

### Version 2 Features

- **Task Verification**: Master validates completed pixels against canvas
- **Advanced Task Types**: Non-square regions, priority queuing, dependencies
- **Performance Analytics**: Detailed bot performance tracking and optimization
- **Room Templates**: Predefined room configurations for common scenarios
- **Persistent History**: Task history and room analytics persistence

### Version 3 Features

- **Authentication System**: User accounts and secure room access
- **Advanced Permissions**: Role-based access control within rooms
- **Cross-Room Coordination**: Task sharing between multiple rooms
- **API Integration**: REST API for external integrations and monitoring
- **Mobile Support**: Mobile-optimized interface for bot monitoring

### Scaling Considerations

- **Horizontal Scaling**: Multiple backend instances with load balancing
- **Redis Clustering**: Distributed Redis setup for high availability
- **Geographic Distribution**: Multi-region deployment for global access
- **Connection Pooling**: Efficient WebSocket connection management
- **Message Queuing**: Advanced message queuing for reliability

## Migration and Rollback

### Feature Flag Implementation

```javascript
// Feature flag for PixelColony
const PIXELCOLONY_ENABLED =
  localStorage.getItem("pixelcolony_enabled") === "true" ||
  window.location.search.includes("pixelcolony=true");

if (PIXELCOLONY_ENABLED) {
  // Initialize PixelColony features
  initializePixelColony();
} else {
  // Standard solo mode operation
  initializeSoloMode();
}
```

### Rollback Strategy

1. **Feature Disable**: Toggle feature flag to disable PixelColony
2. **Service Shutdown**: Graceful shutdown of backend service
3. **Data Preservation**: Maintain Redis data for potential service restart
4. **User Notification**: Inform users of temporary service unavailability
5. **Solo Mode Fallback**: Automatic fallback to existing solo operation

This comprehensive instruction set provides all the necessary information for implementing the PixelColony feature while maintaining backward compatibility and ensuring a robust, scalable solution.
