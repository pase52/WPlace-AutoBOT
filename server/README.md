# WPlace-AutoBOT Server

Real-time coordination server for shared projects using Redis, Express, and Socket.IO.

## Environment

Create a `.env` file (see `.env.example`):
- PORT: HTTP port (default 8010)
- REDIS_HOST, REDIS_PORT, REDIS_PASSWORD, REDIS_TLS
- PUBLIC_ORIGINS: comma-separated allowed origins for CORS (use * for all)

## Run

- Install dependencies
- Start server

## Tests

- Unit/integration tests (mock Redis):
  - Run from `server/`: `npm test`
- Real Redis integration test (optional):
  - Provide environment variables and run:
    - IT_REDIS_HOST
    - IT_REDIS_PORT
    - IT_REDIS_PASSWORD (optional)
    - IT_REDIS_TLS ("true" to enable TLS)
  - Then run: `npm run test:real`

## REST API

- POST /api/projects { name, masterId, visibility: public|private, initialSave }
- GET /api/projects/:id
- POST /api/projects/:id/visibility { visibility }
- POST /api/projects/:id/follow { userId }
- POST /api/projects/:id/unfollow { userId }
- GET /api/projects (public list)

## Socket.IO Events

Client -> server:
- identify { userId, role: master|slave }
- join_project { projectId }
- leave_project { projectId }
- pixel_request { projectId, x, y, color }
- save_update { projectId, save } (master only)

Server -> clients (room project:<id>):
- save_update { projectId, save, ts }

## Redis Model

- project:<id> hash { id, name, masterId, visibility, createdAt }
- project:<id>:save string JSON
- project:<id>:followers set of userIds
- projects:public set of projectIds
- user:<userId>:projects set of projectIds followed
- Channels:
  - project:<id>:pixel_requests (slaves -> master)
  - project:<id>:save_updates (master -> all)

## Notes

- Master must subscribe to pixel_requests for its projects to process pixel placements quickly and publish save updates. You can implement this in your master client using ioredis subscribe to CHANNELS.PIXEL_REQUEST(projectId).
- The server also subscribes to save_updates and relays them to websockets so all clients get updates promptly.


## Test redis
Here’s a quick, concrete checklist to inspect what the server wrote to Redis and to watch pub/sub traffic.

### Verify classic keys
Once connected, run:

- List project keys
  ```
  SCAN 0 MATCH project:* COUNT 100
  ```

- Project details and save payload
  ```
  HGETALL project:<id>
  GET project:<id>:save
  ```

- Followers and counts
  ```
  SMEMBERS project:<id>:followers
  SCARD project:<id>:followers
  ```

- Public projects and user’s followed projects
  ```
  SMEMBERS projects:public
  SMEMBERS user:<userId>:projects
  ```

- Rate limiter state
  ```
  MGET user:<userId>:tokens user:<userId>:tokens_updated_at
  ```

Tip: tokens start “full” (3) on first use; each pixel_request decrements by 1 and refills at 1 per 30s.

### Observe real-time pub/sub

Messages aren’t stored—subscribe and then trigger actions.

- In one terminal (watch save updates):
  ```
  SUBSCRIBE project:<id>:save_updates
  ```
  You’ll see JSON like: {"projectId":"<id>","save":{...},"ts":...}

- In another terminal (watch pixel requests going to the master):
  ```
  SUBSCRIBE project:<id>:pixel_requests
  ```
  You’ll see JSON like: {"userId":"U1","x":1,"y":2,"color":"#fff","ts":...}

Then, from your app/tests, emit a pixel_request or save_update to see messages arrive.


