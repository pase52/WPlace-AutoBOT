# 🤖 PixelColony - Collaborative Multi-Bot Painting System

**PixelColony** is an advanced collaborative system integrated into WPlace AutoBOT that enables multiple bots to work together on large-scale pixel art projects through real-time coordination.

## 🌟 Features

### 🎯 Multi-Bot Coordination
- **Master-Slave Architecture**: One master bot distributes tasks to multiple slave bots
- **Real-Time Communication**: WebSocket-based instant communication
- **Task Distribution**: Intelligent pixel task allocation and management
- **Progress Tracking**: Real-time statistics and completion monitoring

### 🎨 Collaborative Painting
- **Room-Based System**: Create or join painting rooms with unique 8-character IDs
- **Task Claiming**: Slave bots automatically claim and execute painting tasks
- **Anti-Collision**: Prevents multiple bots from painting the same pixels
- **Load Balancing**: Distributes workload evenly among available bots

### 🔧 Advanced Configuration
- **Flexible Task Sizes**: Configurable task chunk sizes (1x1 to 10x10 pixels)
- **Connection Management**: Automatic reconnection and heartbeat monitoring
- **Error Handling**: Robust error recovery and retry mechanisms
- **Multi-Language Support**: Available in English and French

## 🚀 Quick Start

### 1. Backend Setup

First, ensure the PixelColony backend server is running:

```bash
# In the backend directory
npm install
npm run build
npm start
```

The server will start on `ws://localhost:3001` by default.

### 2. Load Auto-Image.js

Load the Auto-Image.js bookmarklet on wplace.live:

```javascript
javascript:fetch('https://raw.githubusercontent.com/[your-repo]/WPlace-AutoBOT2/main/Auto-Image.js').then(r=>r.text()).then(eval)
```

### 3. Enable PixelColony

1. Open the Auto-Image interface
2. Upload an image to paint
3. Look for the **"PixelColony"** section in the UI
4. Configure your WebSocket server URL (default: `ws://localhost:3001`)

## 🎮 Usage Modes

### 🏆 Master Mode (Room Creator)

**Purpose**: Create and manage painting rooms, distribute tasks to slave bots.

**Steps**:
1. Select **"Master"** mode in PixelColony section
2. Click **"Connect"** to connect to the WebSocket server
3. Configure room settings:
   - **Master Name**: Your bot's identifier
   - **Room Description**: Optional description
   - **Task Size**: Pixel chunk size (3x3 recommended)
   - **Max Slaves**: Maximum number of slave bots (default: 10)
4. Click **"Create Room"** 
5. Share the generated 8-character Room ID with slave bots
6. Upload and position your image
7. Start painting - tasks will be automatically distributed

### 👷 Slave Mode (Task Worker)

**Purpose**: Join existing rooms and execute assigned painting tasks.

**Steps**:
1. Select **"Slave"** mode in PixelColony section
2. Click **"Connect"** to connect to the WebSocket server
3. Enter the 8-character **Room ID** provided by the master
4. Enter your **Slave Name** (identifier)
5. Click **"Join Room"**
6. The bot will automatically:
   - Request tasks from the master
   - Paint assigned pixels
   - Report completion
   - Request new tasks

### 🎯 Solo Mode

**Purpose**: Standard single-bot operation without collaboration.

Use this mode for normal Auto-Image functionality without PixelColony features.

## 📊 Monitoring & Statistics

### Master Bot Statistics
- **Connected Slaves**: Number of active slave bots
- **Tasks Distributed**: Total tasks sent to slaves
- **Completion Rate**: Overall project progress
- **Active Tasks**: Currently executing tasks

### Slave Bot Statistics  
- **Tasks Completed**: Number of finished tasks
- **Pixels Placed**: Total pixels painted
- **Current Task**: Details of active task
- **Connection Status**: WebSocket connection state

## 🔧 Configuration Options

### WebSocket Settings
```javascript
// Default WebSocket URL
const wsUrl = 'ws://localhost:3001';

// Custom server configuration
const wsUrl = 'wss://your-pixelcolony-server.com';
```

### Task Size Configuration
- **1x1**: Maximum precision, slower overall progress
- **3x3**: Balanced performance (recommended)
- **5x5**: Faster for large areas
- **10x10**: Maximum speed for bulk painting

### Room Settings
```javascript
{
  taskSize: '3x3',        // Pixel chunk size
  taskTimeout: 30000,     // Task timeout in milliseconds
  maxSlaves: 10,          // Maximum slave bots
  description: 'My Art'   // Room description
}
```

## 🛠️ Technical Implementation

### Message Protocol

PixelColony uses a standardized JSON message protocol:

```javascript
{
  type: 'message_type',
  version: 'v1',
  timestamp: '2024-01-01T00:00:00.000Z',
  id: 'unique-message-id',
  data: {
    // Message-specific data
  }
}
```

### Message Types

| Type | Direction | Purpose |
|------|-----------|---------|
| `room_create` | Client → Server | Create new room |
| `room_join` | Client → Server | Join existing room |
| `room_leave` | Client → Server | Leave current room |
| `task_claim` | Client → Server | Request new task |
| `task_complete` | Client → Server | Report task completion |
| `room_created` | Server → Client | Room creation confirmation |
| `room_joined` | Server → Client | Room join confirmation |
| `task_claimed` | Server → Client | Task assignment |
| `no_tasks` | Server → Client | No tasks available |
| `error` | Server → Client | Error notification |

### State Management

```javascript
const state = {
  pixelColonyEnabled: false,
  pixelColonyMode: 'solo',          // 'solo', 'master', 'slave'
  pixelColonyConnected: false,
  pixelColonyWs: null,
  pixelColonyWsUrl: 'ws://localhost:3001',
  pixelColonyRoomId: null,
  pixelColonyMasterId: null,
  pixelColonySlaveId: null,
  pixelColonyCurrentTask: null,
  pixelColonyTaskStatistics: {
    tasksCompleted: 0,
    pixelsPlaced: 0,
    errorsCount: 0
  }
};
```

## 🔍 Troubleshooting

### Connection Issues

**Problem**: Cannot connect to WebSocket server
```
❌ WebSocket connection failed
```

**Solutions**:
1. Verify server is running on specified port
2. Check firewall settings
3. Ensure WebSocket URL is correct
4. Try `ws://` instead of `wss://` for local development

### Room Issues

**Problem**: Cannot join room
```
❌ Invalid room ID or room not found
```

**Solutions**:
1. Verify the 8-character room ID is correct
2. Ensure master bot created the room successfully
3. Check that room hasn't expired or been closed

### Task Issues

**Problem**: No tasks received
```
⌛ No tasks available, waiting...
```

**Solutions**:
1. Verify master bot has uploaded an image
2. Check that image positioning is complete
3. Ensure master bot started painting process
4. Confirm slave bot is properly connected to room

### Performance Issues

**Problem**: Slow task execution

**Solutions**:
1. Reduce task size (e.g., 3x3 instead of 5x5)
2. Decrease number of concurrent slaves
3. Check network latency to server
4. Verify adequate charges are available

## 🔐 Security Considerations

### Network Security
- Use `wss://` (WebSocket Secure) for production deployments
- Implement proper authentication if running public servers
- Consider rate limiting to prevent abuse

### Bot Detection
- Use human-like delays between pixel placements
- Implement jitter in task execution timing
- Monitor and respect wplace.live rate limits

## 📈 Performance Optimization

### Server-Side
- Use Redis for high-performance task queue management
- Implement connection pooling for WebSocket handling
- Use clustering for horizontal scaling

### Client-Side  
- Batch pixel operations when possible
- Cache task data to reduce memory usage
- Implement intelligent retry strategies

## 🤝 Contributing

### Adding New Features
1. Extend the message protocol with new message types
2. Update both frontend and backend implementations
3. Add appropriate error handling and validation
4. Update documentation and test cases

### Testing
Use the provided test file to validate functionality:
```bash
# Open in browser
test-pixelcolony.html
```

## 📝 Changelog

### Version 1.0.0 (Current)
- ✅ Initial PixelColony implementation
- ✅ Master-slave architecture
- ✅ WebSocket communication
- ✅ Task distribution and tracking
- ✅ Real-time statistics
- ✅ Multi-language support (EN/FR)
- ✅ Integration with Auto-Image.js

### Planned Features
- 🔄 Advanced load balancing algorithms
- 🔄 Persistent room storage
- 🔄 Bot performance analytics
- 🔄 Enhanced error recovery
- 🔄 Mobile app support

## 📚 API Reference

### PixelColony Object

#### Methods

##### `connect(wsUrl)`
Establishes WebSocket connection to PixelColony server.

**Parameters:**
- `wsUrl` (string): WebSocket server URL

**Returns:** Promise that resolves when connected

##### `createRoom()`
Creates a new painting room (Master mode only).

**Returns:** Promise with room creation result

##### `joinRoom(roomId, slaveName)`
Joins an existing room (Slave mode only).

**Parameters:**
- `roomId` (string): 8-character room identifier
- `slaveName` (string): Slave bot identifier

##### `leaveRoom()`
Leaves the current room.

##### `paintTask(task)`
Executes a painting task (Slave mode only).

**Parameters:**
- `task` (object): Task containing pixel coordinates and colors

##### `updateModeUI(mode)`
Updates UI based on selected mode.

**Parameters:**
- `mode` (string): 'solo', 'master', or 'slave'

### Utils Extensions

#### `generateId()`
Generates unique identifier for messages.

**Returns:** String with unique ID

#### `paintPixel(x, y, colorId)`
Paints a single pixel at specified coordinates.

**Parameters:**
- `x` (number): X coordinate
- `y` (number): Y coordinate  
- `colorId` (number): Color identifier

**Returns:** Promise with paint result

## 🏆 Best Practices

### For Master Bots
1. **Image Preparation**: Optimize images before uploading
2. **Task Sizing**: Use 3x3 tasks for best balance
3. **Slave Management**: Monitor slave bot health and performance
4. **Progress Tracking**: Regularly check completion statistics

### For Slave Bots  
1. **Stable Connection**: Ensure reliable internet connection
2. **Resource Management**: Monitor CPU and memory usage
3. **Error Handling**: Implement proper retry logic
4. **Coordination**: Follow master bot instructions precisely

### For Server Administration
1. **Resource Monitoring**: Track server CPU, memory, and network usage
2. **Connection Limits**: Set appropriate concurrent connection limits
3. **Logging**: Implement comprehensive logging for debugging
4. **Backup**: Regular backup of room and task data

---

**PixelColony** - Transforming collaborative pixel art through intelligent automation! 🎨🤖
