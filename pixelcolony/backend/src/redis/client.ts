import { serverConfig } from "@/config";
import { log } from "@/utils/logger";
import Redis from "ioredis";

export class RedisClient {
  public readonly client: Redis;
  public readonly subscriber: Redis;
  public readonly publisher: Redis;

  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;

  constructor() {
    const redisOptions = {
      retryDelayOnFailover: 100,
      enableReadyCheck: false,
      lazyConnect: true,
      maxRetriesPerRequest: 3,
      retryDelayOnReload: 50,
      db: 0,
    };

    // Main Redis client for general operations
    this.client = new Redis(serverConfig.redisUrl, {
      ...redisOptions,
    });

    // Dedicated subscriber client for pub/sub
    this.subscriber = new Redis(serverConfig.redisUrl, {
      ...redisOptions,
    });

    // Dedicated publisher client for pub/sub
    this.publisher = new Redis(serverConfig.redisUrl, {
      ...redisOptions,
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // Main client events
    this.client.on("connect", () => {
      log.redis.connect();
      this.isConnected = true;
      this.reconnectAttempts = 0;
    });

    this.client.on("error", (error: Error) => {
      log.redis.error(error, "main_client");
      this.isConnected = false;
    });

    this.client.on("close", () => {
      log.redis.disconnect();
      this.isConnected = false;
      this.handleReconnect();
    });

    // Subscriber events
    this.subscriber.on("connect", () => {
      log.debug("Redis subscriber connected");
    });

    this.subscriber.on("error", (error: Error) => {
      log.redis.error(error, "subscriber");
    });

    // Publisher events
    this.publisher.on("connect", () => {
      log.debug("Redis publisher connected");
    });

    this.publisher.on("error", (error: Error) => {
      log.redis.error(error, "publisher");
    });
  }

  private async handleReconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      log.error("Max Redis reconnection attempts reached");
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * this.reconnectAttempts;

    log.warn(
      `Attempting Redis reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`
    );

    setTimeout(async () => {
      try {
        await this.connect();
      } catch (error) {
        log.redis.error(error as Error, "reconnect");
      }
    }, delay);
  }

  public async connect(): Promise<void> {
    try {
      await Promise.all([
        this.client.connect(),
        this.subscriber.connect(),
        this.publisher.connect(),
      ]);
      log.info("All Redis clients connected successfully");
    } catch (error) {
      log.redis.error(error as Error, "connect");
      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    try {
      await Promise.all([
        this.client.disconnect(),
        this.subscriber.disconnect(),
        this.publisher.disconnect(),
      ]);
      log.info("All Redis clients disconnected");
    } catch (error) {
      log.redis.error(error as Error, "disconnect");
      throw error;
    }
  }

  public isHealthy(): boolean {
    return (
      this.isConnected &&
      this.client.status === "ready" &&
      this.subscriber.status === "ready" &&
      this.publisher.status === "ready"
    );
  }

  // Pub/Sub operations
  public async subscribe(
    channel: string,
    callback: (message: string) => void
  ): Promise<void> {
    try {
      await this.subscriber.subscribe(channel);
      this.subscriber.on("message", (receivedChannel, message) => {
        if (receivedChannel === channel) {
          callback(message);
        }
      });
      log.redis.pubsub(channel, "subscribe");
    } catch (error) {
      log.redis.error(error as Error, `subscribe:${channel}`);
      throw error;
    }
  }

  public async unsubscribe(channel: string): Promise<void> {
    try {
      await this.subscriber.unsubscribe(channel);
      log.redis.pubsub(channel, "unsubscribe");
    } catch (error) {
      log.redis.error(error as Error, `unsubscribe:${channel}`);
      throw error;
    }
  }

  public async publish(channel: string, message: any): Promise<number> {
    try {
      const serializedMessage = JSON.stringify(message);
      const result = await this.publisher.publish(channel, serializedMessage);
      log.redis.pubsub(channel, "publish", message);
      return result;
    } catch (error) {
      log.redis.error(error as Error, `publish:${channel}`);
      throw error;
    }
  }

  // Key-value operations
  public async set(key: string, value: any, ttl?: number): Promise<void> {
    try {
      const serializedValue = JSON.stringify(value);
      if (ttl) {
        await this.client.setex(key, ttl, serializedValue);
      } else {
        await this.client.set(key, serializedValue);
      }
    } catch (error) {
      log.redis.error(error as Error, `set:${key}`);
      throw error;
    }
  }

  public async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      log.redis.error(error as Error, `get:${key}`);
      throw error;
    }
  }

  public async del(key: string): Promise<number> {
    try {
      return await this.client.del(key);
    } catch (error) {
      log.redis.error(error as Error, `del:${key}`);
      throw error;
    }
  }

  public async exists(key: string): Promise<boolean> {
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      log.redis.error(error as Error, `exists:${key}`);
      throw error;
    }
  }

  // Set operations
  public async sadd(key: string, ...members: string[]): Promise<number> {
    try {
      return await this.client.sadd(key, ...members);
    } catch (error) {
      log.redis.error(error as Error, `sadd:${key}`);
      throw error;
    }
  }

  public async srem(key: string, ...members: string[]): Promise<number> {
    try {
      return await this.client.srem(key, ...members);
    } catch (error) {
      log.redis.error(error as Error, `srem:${key}`);
      throw error;
    }
  }

  public async smembers(key: string): Promise<string[]> {
    try {
      return await this.client.smembers(key);
    } catch (error) {
      log.redis.error(error as Error, `smembers:${key}`);
      throw error;
    }
  }

  public async sismember(key: string, member: string): Promise<boolean> {
    try {
      const result = await this.client.sismember(key, member);
      return result === 1;
    } catch (error) {
      log.redis.error(error as Error, `sismember:${key}`);
      throw error;
    }
  }

  public async scard(key: string): Promise<number> {
    try {
      return await this.client.scard(key);
    } catch (error) {
      log.redis.error(error as Error, `scard:${key}`);
      throw error;
    }
  }

  // List operations
  public async lpush(key: string, ...values: string[]): Promise<number> {
    try {
      return await this.client.lpush(key, ...values);
    } catch (error) {
      log.redis.error(error as Error, `lpush:${key}`);
      throw error;
    }
  }

  public async rpop(key: string): Promise<string | null> {
    try {
      return await this.client.rpop(key);
    } catch (error) {
      log.redis.error(error as Error, `rpop:${key}`);
      throw error;
    }
  }

  public async brpoplpush(
    source: string,
    destination: string,
    timeout: number
  ): Promise<string | null> {
    try {
      return await this.client.brpoplpush(source, destination, timeout);
    } catch (error) {
      log.redis.error(error as Error, `brpoplpush:${source}->${destination}`);
      throw error;
    }
  }

  public async llen(key: string): Promise<number> {
    try {
      return await this.client.llen(key);
    } catch (error) {
      log.redis.error(error as Error, `llen:${key}`);
      throw error;
    }
  }

  // Hash operations
  public async hset(key: string, field: string, value: any): Promise<number> {
    try {
      const serializedValue = JSON.stringify(value);
      return await this.client.hset(key, field, serializedValue);
    } catch (error) {
      log.redis.error(error as Error, `hset:${key}:${field}`);
      throw error;
    }
  }

  public async hget<T>(key: string, field: string): Promise<T | null> {
    try {
      const value = await this.client.hget(key, field);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      log.redis.error(error as Error, `hget:${key}:${field}`);
      throw error;
    }
  }

  public async hgetall<T>(key: string): Promise<Record<string, T>> {
    try {
      const result = await this.client.hgetall(key);
      const parsed: Record<string, T> = {};
      for (const [field, value] of Object.entries(result)) {
        parsed[field] = JSON.parse(value);
      }
      return parsed;
    } catch (error) {
      log.redis.error(error as Error, `hgetall:${key}`);
      throw error;
    }
  }

  public async hdel(key: string, ...fields: string[]): Promise<number> {
    try {
      return await this.client.hdel(key, ...fields);
    } catch (error) {
      log.redis.error(error as Error, `hdel:${key}`);
      throw error;
    }
  }

  // Expiration operations
  public async expire(key: string, seconds: number): Promise<boolean> {
    try {
      const result = await this.client.expire(key, seconds);
      return result === 1;
    } catch (error) {
      log.redis.error(error as Error, `expire:${key}`);
      throw error;
    }
  }

  public async ttl(key: string): Promise<number> {
    try {
      return await this.client.ttl(key);
    } catch (error) {
      log.redis.error(error as Error, `ttl:${key}`);
      throw error;
    }
  }

  // Batch operations
  public async pipeline(): Promise<any> {
    return this.client.pipeline();
  }

  public async multi(): Promise<any> {
    return this.client.multi();
  }

  // Health check
  public async ping(): Promise<string> {
    try {
      return await this.client.ping();
    } catch (error) {
      log.redis.error(error as Error, "ping");
      throw error;
    }
  }

  // Memory and performance monitoring
  public async getMemoryUsage(): Promise<any> {
    try {
      const info = await this.client.memory("STATS");
      return info;
    } catch (error) {
      log.redis.error(error as Error, "memory_usage");
      throw error;
    }
  }

  public async getInfo(): Promise<string> {
    try {
      return await this.client.info();
    } catch (error) {
      log.redis.error(error as Error, "info");
      throw error;
    }
  }

  /**
   * Get Redis client status
   */
  public getStatus(): any {
    return {
      connected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      client: this.client.status,
      subscriber: this.subscriber.status,
      publisher: this.publisher.status,
    };
  }
}

// Singleton instance
export const redis = new RedisClient();
