/**
 * Room persistence — Upstash Redis in production, in-memory + disk fallback for local dev.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEV_STORE_PATH = path.join(__dirname, '..', '..', '.dev-room-store.json');

const memoryStore = new Map();
let redis = null;
let _redisChecked = false;
let _memoryLoaded = false;

function loadMemoryFromDisk() {
  if (_memoryLoaded) return;
  _memoryLoaded = true;
  try {
    if (!fs.existsSync(DEV_STORE_PATH)) return;
    const data = JSON.parse(fs.readFileSync(DEV_STORE_PATH, 'utf8'));
    for (const [code, room] of Object.entries(data)) {
      memoryStore.set(code, room);
    }
  } catch (_) { /* ignore corrupt dev store */ }
}

function persistMemoryToDisk() {
  try {
    fs.writeFileSync(DEV_STORE_PATH, JSON.stringify(Object.fromEntries(memoryStore)), 'utf8');
  } catch (_) { /* ignore write errors in read-only envs */ }
}

async function getRedis() {
  if (!_redisChecked) {
    _redisChecked = true;
    if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
      try {
        const { Redis } = await import('@upstash/redis');
        redis = new Redis({
          url: process.env.UPSTASH_REDIS_REST_URL,
          token: process.env.UPSTASH_REDIS_REST_TOKEN,
        });
      } catch (_) {
        // Package not installed — use in-memory store
        redis = null;
      }
    }
  }
  return redis;
}

const ROOM_TTL_SECONDS = 7200; // 2 hours

export async function getRoom(code) {
  const r = await getRedis();
  if (r) {
    return await r.get(`barricade:room:${code}`);
  }
  loadMemoryFromDisk();
  return memoryStore.get(code) ?? null;
}

export async function setRoom(code, room) {
  const r = await getRedis();
  if (r) {
    await r.set(`barricade:room:${code}`, room, { ex: ROOM_TTL_SECONDS });
  } else {
    memoryStore.set(code, room);
    persistMemoryToDisk();
  }
}

export async function deleteRoom(code) {
  const r = await getRedis();
  if (r) {
    await r.del(`barricade:room:${code}`);
  } else {
    memoryStore.delete(code);
    persistMemoryToDisk();
  }
}

export async function listRooms() {
  const r = await getRedis();
  if (r) {
    try {
      const keys = await r.keys('barricade:room:*');
      const rooms = [];
      for (const key of keys) {
        const room = await r.get(key);
        if (room && room.status === 'waiting' && !room.isPrivate) {
          // Extract room code from key if room.code is missing
          const code = room.code || key.split(':').pop();
          rooms.push({
            code,
            status: room.status,
            hostName: room.players[0]?.name || 'Anonymous',
            createdAt: room.createdAt || Date.now(),
            timeControl: room.timeControl || '15+10 (Rapid)',
            mode: room.mode || 'Casual'
          });
        }
      }
      return rooms;
    } catch (err) {
      console.error('Redis listRooms error:', err);
      return [];
    }
  } else {
    loadMemoryFromDisk();
    const rooms = [];
    for (const [code, room] of memoryStore.entries()) {
      if (room && room.status === 'waiting' && !room.isPrivate) {
        rooms.push({
          code: room.code || code,
          status: room.status,
          hostName: room.players[0]?.name || 'Anonymous',
          createdAt: room.createdAt || Date.now(),
          timeControl: room.timeControl || '15+10 (Rapid)',
          mode: room.mode || 'Casual'
        });
      }
    }
    return rooms;
  }
}
