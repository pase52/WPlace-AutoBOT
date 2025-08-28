import { serverConfig } from "@/config";
import { PixelColonyService } from "@/services/pixelColonyService";
import { log } from "@/utils/logger";
import compression from "compression";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { createServer } from "http";

class Server {
  private app: express.Application;
  private server: ReturnType<typeof createServer>;
  private pixelColonyService: PixelColonyService;

  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.pixelColonyService = PixelColonyService.getInstance();

    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    // Security middleware
    if (serverConfig.helmetEnabled) {
      this.app.use(
        helmet({
          contentSecurityPolicy: false, // Disable for WebSocket connections
        })
      );
    }

    // CORS middleware
    if (serverConfig.corsEnabled) {
      this.app.use(
        cors({
          origin: serverConfig.corsOrigin,
          credentials: true,
        })
      );
    }

    // Compression middleware
    this.app.use(compression());

    // JSON parsing middleware
    this.app.use(express.json({ limit: "10mb" }));
    this.app.use(express.urlencoded({ extended: true, limit: "10mb" }));

    // Request logging
    this.app.use((req, res, next) => {
      log.debug("HTTP Request", {
        method: req.method,
        url: req.url,
        ip: req.ip,
        userAgent: req.get("User-Agent"),
      });
      next();
    });
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get("/health", (req, res) => {
      res.json({
        status: "ok",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
      });
    });

    // Stats endpoint
    this.app.get("/stats", (req, res) => {
      try {
        const stats = this.pixelColonyService.getStats();
        res.json(stats);
      } catch (error) {
        log.error("Failed to get stats", { error: (error as Error).message });
        res.status(500).json({ error: "Internal server error" });
      }
    });

    // API endpoints
    this.app.get("/api/rooms", async (req, res) => {
      try {
        const rooms = await this.pixelColonyService
          .getRoomManager()
          .getActiveRooms();
        res.json({ rooms });
      } catch (error) {
        log.error("Failed to get rooms", { error: (error as Error).message });
        res.status(500).json({ error: "Internal server error" });
      }
    });

    this.app.get("/api/rooms/:roomId", async (req, res) => {
      try {
        const { roomId } = req.params;
        const [room, slaves, stats] = await Promise.all([
          this.pixelColonyService.getRoomManager().getRoom(roomId),
          this.pixelColonyService.getRoomManager().getRoomSlaves(roomId),
          this.pixelColonyService
            .getTaskManager()
            .getRoomTaskStatistics(roomId),
        ]);

        if (!room) {
          return res.status(404).json({ error: "Room not found" });
        }

        return res.json({
          room,
          slaves,
          taskStatistics: stats,
        });
      } catch (error) {
        log.error("Failed to get room", {
          error: (error as Error).message,
          roomId: req.params.roomId,
        });
        return res.status(500).json({ error: "Internal server error" });
      }
    });

    // 404 handler
    this.app.use("*", (req, res) => {
      res.status(404).json({
        error: "Not found",
        path: req.originalUrl,
      });
    });

    // Error handler
    this.app.use(
      (
        err: Error,
        req: express.Request,
        res: express.Response,
        next: express.NextFunction
      ) => {
        log.error("Express error", {
          error: err.message,
          stack: err.stack,
          url: req.url,
          method: req.method,
        });

        res.status(500).json({
          error: "Internal server error",
          message:
            process.env.NODE_ENV === "development" ? err.message : undefined,
        });
      }
    );
  }

  public async start(): Promise<void> {
    try {
      // Initialize PixelColony service
      await this.pixelColonyService.initialize(this.server, serverConfig);

      // Start HTTP server
      await new Promise<void>((resolve, reject) => {
        this.server.listen(serverConfig.port, () => {
          log.info("Server started", {
            port: serverConfig.port,
            env: process.env.NODE_ENV || "development",
          });
          resolve();
        });

        this.server.on("error", reject);
      });
    } catch (error) {
      log.error("Failed to start server", { error: (error as Error).message });
      throw error;
    }
  }

  public async stop(): Promise<void> {
    try {
      log.info("Stopping server...");

      // Shutdown PixelColony service
      await this.pixelColonyService.shutdown();

      // Close HTTP server
      await new Promise<void>((resolve, reject) => {
        this.server.close((err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });

      log.info("Server stopped successfully");
    } catch (error) {
      log.error("Error stopping server", { error: (error as Error).message });
      throw error;
    }
  }
}

// Create server instance
const server = new Server();

// Graceful shutdown handling
const gracefulShutdown = async (signal: string) => {
  log.info(`Received ${signal}, shutting down gracefully...`);

  try {
    await server.stop();
    process.exit(0);
  } catch (error) {
    log.error("Error during shutdown", { error: (error as Error).message });
    process.exit(1);
  }
};

// Register shutdown handlers
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  log.error("Uncaught exception", { error: error.message, stack: error.stack });
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  log.error("Unhandled rejection", { reason, promise });
  process.exit(1);
});

// Start server
if (require.main === module) {
  server.start().catch((error) => {
    log.error("Failed to start server", { error: error.message });
    process.exit(1);
  });
}

export default server;
