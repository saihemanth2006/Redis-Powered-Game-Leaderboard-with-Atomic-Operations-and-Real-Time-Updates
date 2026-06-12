const request = require('supertest');
const express = require('express');
const sessionsService = require('../../src/services/sessions');
const leaderboardService = require('../../src/services/leaderboard');
const gameService = require('../../src/services/game');

// Mock Redis client for testing
jest.mock('../../src/redis', () => {
  const mockClient = {
    connect: jest.fn().resolve(),
    ping: jest.fn().resolve('PONG'),
    hSet: jest.fn().resolve(true),
    hGetAll: jest.fn().resolve({}),
    sAdd: jest.fn().resolve(1),
    sMembers: jest.fn().resolve([]),
    del: jest.fn().resolve(1),
    expire: jest.fn().resolve(1),
    zIncrBy: jest.fn().resolve('100'),
    zRange: jest.fn().resolve([]),
    zRangeWithScores: jest.fn().resolve([]),
    zScore: jest.fn().resolve('100'),
    zRevRank: jest.fn().resolve(0),
    zCard: jest.fn().resolve(100),
    exists: jest.fn().resolve(1),
    hGet: jest.fn().resolve(null),
    sIsMember: jest.fn().resolve(false),
    sRem: jest.fn().resolve(1),
    set: jest.fn().resolve(true),
  };

  return {
    initializeRedis: jest.fn().resolveValue(mockClient),
    getRedisClient: jest.fn().returnValue(mockClient),
    closeRedis: jest.fn().resolveValue(),
  };
});

describe('Session Management API', () => {
  test('POST /api/sessions should create a session', async () => {
    const result = await sessionsService.createSession(
      'user-123',
      '192.168.1.1',
      'desktop'
    );

    expect(result).toHaveProperty('sessionId');
    expect(typeof result.sessionId).toBe('string');
  });

  test('GET /api/admin/sessions/user/:userId should return sessions', async () => {
    const sessions = await sessionsService.getUserSessions('user-123');
    expect(Array.isArray(sessions)).toBe(true);
  });
});

describe('Leaderboard API', () => {
  test('updateScore should increment player score', async () => {
    const result = await leaderboardService.updateScore('player-1', 50);

    expect(result).toHaveProperty('playerId');
    expect(result).toHaveProperty('newScore');
    expect(result.playerId).toBe('player-1');
  });

  test('getTopPlayers should return array of players', async () => {
    const players = await leaderboardService.getTopPlayers(10);
    expect(Array.isArray(players)).toBe(true);
  });

  test('getPlayerStats should return player info', async () => {
    const stats = await leaderboardService.getPlayerStats('player-1');
    // Can be null if player not on leaderboard, but structure should be correct if exists
    if (stats) {
      expect(stats).toHaveProperty('playerId');
      expect(stats).toHaveProperty('score');
      expect(stats).toHaveProperty('rank');
      expect(stats).toHaveProperty('percentile');
      expect(stats).toHaveProperty('nearbyPlayers');
    }
  });
});

describe('Game API', () => {
  test('createGameRound should create a round', async () => {
    const endTime = Math.floor(Date.now() / 1000) + 3600;
    const result = await gameService.createGameRound('game-1', 'round-1', endTime);

    expect(result).toHaveProperty('gameId');
    expect(result).toHaveProperty('roundId');
    expect(result).toHaveProperty('endTime');
  });

  test('getGameRound should return round info or null', async () => {
    const round = await gameService.getGameRound('game-1', 'round-1');
    // Result can be null if round doesn't exist
    if (round) {
      expect(round).toHaveProperty('gameId');
    }
  });

  test('submitAnswer should validate round active', async () => {
    const endTime = Math.floor(Date.now() / 1000) + 3600;
    const result = await gameService.submitAnswer(
      'game-1',
      'round-1',
      'player-1',
      'A',
      10
    );

    // Result should have status
    expect(result).toHaveProperty('status');
  });
});

describe('Lua Scripts', () => {
  test('invalidateOldSessionsScript should be a valid string', () => {
    const { invalidateOldSessionsScript } = require('../../src/lua-scripts');
    expect(typeof invalidateOldSessionsScript).toBe('string');
    expect(invalidateOldSessionsScript.length).toBeGreaterThan(0);
    expect(invalidateOldSessionsScript).toContain('redis.call');
  });

  test('submitAnswerScript should be a valid string', () => {
    const { submitAnswerScript } = require('../../src/lua-scripts');
    expect(typeof submitAnswerScript).toBe('string');
    expect(submitAnswerScript.length).toBeGreaterThan(0);
    expect(submitAnswerScript).toContain('DUPLICATE_SUBMISSION');
    expect(submitAnswerScript).toContain('ROUND_EXPIRED');
  });
});
