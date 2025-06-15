import { Injectable } from '@nestjs/common';
import { createClient } from 'redis';
import * as dotenv from 'dotenv';

dotenv.config();

@Injectable()
export class RedisService {
  private client: any;
  private isConnecting = false;

  constructor() {
    this.client = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      socket: {
        reconnectStrategy: retries => Math.min(retries * 200, 5000),
        connectTimeout: 15000
      }
    });
    
    this.client.on('error', err => console.error('[RedisService] Error:', err));
    this.client.on('ready', () => console.log('[RedisService] Connected to Redis'));
    this.client.on('end', () => console.log('[RedisService] Disconnected from Redis'));
  }

  async connect() {
    if (this.isConnecting) {
      console.log('[RedisService] Connection in progress, skipping');
      return;
    }
    if (!this.client.isOpen) {
      this.isConnecting = true;
      try {
        await this.client.connect();
      } catch (err: any) {
        console.error('[RedisService] Connection error:', err);
        throw new Error(`Failed to connect to Redis: ${err.message}`);
      } finally {
        this.isConnecting = false;
      }
    }
  }

  getClient() {
    return this.client;
  }

  async set(key: string, value: string, ttl?: number): Promise<boolean> {
    try {
      await this.connect();
      const options = ttl ? { PX: ttl } : {};
      const result = await this.client.set(key, value, options);
      return result === 'OK';
    } catch (err) {
      console.error('[RedisService] set error:', err);
      return false;
    }
  }

  async setNx(key: string, value: string, ttl: number): Promise<boolean> {
    try {
      await this.connect();
      const result = await this.client.set(key, value, { NX: true, PX: ttl });
      return result === 'OK';
    } catch (err) {
      console.error('[RedisService] setNx error:', err);
      return false;
    }
  }

  async get(key: string): Promise<string | null> {
    try {
      await this.connect();
      return await this.client.get(key);
    } catch (err) {
      console.error('[RedisService] get error:', err);
      return null;
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.connect();
      await this.client.del(key);
    } catch (err) {
      console.error('[RedisService] del error:', err);
    }
  }

  async flushAll(): Promise<void> {
    try {
      await this.connect();
      await this.client.flushAll();
      console.log('[RedisService] Flushed all Redis cache');
    } catch (err) {
      console.error('[RedisService] flushAll error:', err);
    }
  }

  async deleteByPattern(pattern: string): Promise<void> {
    try {
      await this.connect();
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(keys);
        console.log(`[RedisService] Deleted ${keys.length} keys matching pattern: ${pattern}`);
      } else {
        console.log(`[RedisService] No keys found for pattern: ${pattern}`);
      }
    } catch (err) {
      console.error('[RedisService] deleteByPattern error:', err);
    }
  }

  async quit() {
    if (this.client.isOpen) {
      await this.client.quit();
    }
  }
}
