const { getRedisClient } = require('../redis');
const { v4: uuidv4 } = require('uuid');
const {
  invalidateOldSessionsScript,
  deleteSessionScript,
} = require('../lua-scripts');

async function createSession(userId, ipAddress, deviceType) {
  const client = getRedisClient();
  const sessionId = uuidv4();
  const sessionKey = `session:${sessionId}`;
  const userSessionsKey = `user_sessions:${userId}`;
  const now = new Date().toISOString();
  const sessionTTL = parseInt(process.env.SESSION_TTL || 1800);

  // Execute Lua script to invalidate old sessions and create new one
  const script = invalidateOldSessionsScript;
  
  try {
    // First, set the session hash with all fields
    await client.hSet(sessionKey, {
      userId,
      ipAddress,
      deviceType,
      createdAt: now,
      lastActive: now,
    });

    // Get old sessions
    const oldSessionIds = await client.sMembers(userSessionsKey);

    // Delete old sessions
    for (const oldSessionId of oldSessionIds) {
      await client.del(`session:${oldSessionId}`);
    }

    // Clear user sessions set and add only the new one
    await client.del(userSessionsKey);
    await client.sAdd(userSessionsKey, sessionId);

    // Set expiration
    await client.expire(sessionKey, sessionTTL);
    await client.expire(userSessionsKey, sessionTTL);

    return { sessionId };
  } catch (error) {
    console.error('Error creating session:', error);
    throw error;
  }
}

async function getUserSessions(userId) {
  const client = getRedisClient();
  const userSessionsKey = `user_sessions:${userId}`;

  try {
    const sessionIds = await client.sMembers(userSessionsKey);
    const sessions = [];

    for (const sessionId of sessionIds) {
      const sessionKey = `session:${sessionId}`;
      const sessionData = await client.hGetAll(sessionKey);

      if (Object.keys(sessionData).length > 0) {
        sessions.push({
          sessionId,
          ...sessionData,
        });
      }
    }

    return sessions;
  } catch (error) {
    console.error('Error getting user sessions:', error);
    throw error;
  }
}

async function deleteSession(sessionId) {
  const client = getRedisClient();
  const sessionKey = `session:${sessionId}`;

  try {
    // Get userId before deleting
    const userId = await client.hGet(sessionKey, 'userId');

    // Delete session
    await client.del(sessionKey);

    // Remove from user sessions set
    if (userId) {
      await client.sRem(`user_sessions:${userId}`, sessionId);
    }

    return { deleted: true };
  } catch (error) {
    console.error('Error deleting session:', error);
    throw error;
  }
}

module.exports = {
  createSession,
  getUserSessions,
  deleteSession,
};
