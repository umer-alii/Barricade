/**
 * Room code and token generation utilities.
 */

import crypto from 'node:crypto';
import { createClockState } from './timeControl.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I ambiguity

export function generateRoomCode() {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

export function generateToken() {
  return crypto.randomUUID();
}

export function createInitialGameState(timeControl = '15+10 (Rapid)') {
  return {
    currentPlayer: 0,
    players: [
      { playerIndex: 0, col: 4, row: 0, walls: 10 },
      { playerIndex: 1, col: 4, row: 8, walls: 10 }
    ],
    horizontalWalls: [],
    verticalWalls: [],
    history: [],
    winner: null,
    endReason: null,
    resignedBy: null,
    gameMode: 'online',
    botDifficulty: 'medium',
    humanPlayerIndex: 0,
    ...createClockState(timeControl)
  };
}

export function createRoomObject(code, hostToken, hostName = 'Player 1') {
  return {
    code,
    status: 'waiting',
    version: 1,
    createdAt: Date.now(),
    lastActivity: Date.now(),
    players: [
      {
        token: hostToken,
        name: hostName,
        index: 0,
        connected: true,
        lastSeen: Date.now()
      },
      null
    ],
    gameState: null
  };
}

/**
 * Coerce untrusted input into a normalized room code.
 * Non-string values (objects, numbers, null) yield '' rather than throwing.
 */
export function normalizeRoomCode(value) {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

export function findPlayerByToken(room, token) {
  if (!room || !token) return null;
  for (const player of room.players) {
    if (player && player.token === token) return player;
  }
  return null;
}

export function jsonResponse(res, status, data) {
  res.status(status).json(data);
}

export function handleCors(req, res) {
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return true;
  }
  return false;
}
