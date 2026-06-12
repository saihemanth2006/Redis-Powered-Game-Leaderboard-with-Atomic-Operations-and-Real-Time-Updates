const { getRedisClient } = require('../redis');
const { submitAnswerScript } = require('../lua-scripts');

async function submitAnswer(gameId, roundId, playerId, answer, points) {
  const client = getRedisClient();
  const roundKey = `game_round:${gameId}:${roundId}`;
  const submissionsKey = `submissions:${gameId}:${roundId}`;
  const leaderboardKey = 'leaderboard:global';
  const currentTime = Math.floor(Date.now() / 1000);

  try {
    // Check if round exists
    const roundExists = await client.exists(roundKey);
    if (!roundExists) {
      return {
        status: 'ERROR',
        code: 'ROUND_NOT_FOUND',
      };
    }

    // Get round end time
    const endTime = parseInt(await client.hGet(roundKey, 'endTime'));
    if (!endTime) {
      return {
        status: 'ERROR',
        code: 'INVALID_ROUND',
      };
    }

    // Check if round is still active
    if (currentTime >= endTime) {
      return {
        status: 'ERROR',
        code: 'ROUND_EXPIRED',
      };
    }

    // Check if player already submitted
    const alreadySubmitted = await client.sIsMember(submissionsKey, playerId);
    if (alreadySubmitted) {
      return {
        status: 'ERROR',
        code: 'DUPLICATE_SUBMISSION',
      };
    }

    // Record submission
    await client.sAdd(submissionsKey, playerId);

    // Update player score
    const newScore = await client.zIncrBy(leaderboardKey, points, playerId);

    // Also store the answer if needed
    const answerKey = `answer:${gameId}:${roundId}:${playerId}`;
    await client.set(answerKey, answer);
    await client.expire(answerKey, 86400); // 24 hours

    return {
      status: 'SUCCESS',
      newScore: parseFloat(newScore),
    };
  } catch (error) {
    console.error('Error submitting answer:', error);
    throw error;
  }
}

async function createGameRound(gameId, roundId, endTime) {
  const client = getRedisClient();
  const roundKey = `game_round:${gameId}:${roundId}`;

  try {
    await client.hSet(roundKey, {
      gameId,
      roundId,
      endTime,
      createdAt: new Date().toISOString(),
    });

    // Set expiration to 24 hours after round ends
    const ttl = parseInt(endTime) - Math.floor(Date.now() / 1000) + 86400;
    if (ttl > 0) {
      await client.expire(roundKey, ttl);
    }

    // Create submissions set
    const submissionsKey = `submissions:${gameId}:${roundId}`;
    await client.expire(submissionsKey, ttl);

    return {
      gameId,
      roundId,
      endTime,
    };
  } catch (error) {
    console.error('Error creating game round:', error);
    throw error;
  }
}

async function getGameRound(gameId, roundId) {
  const client = getRedisClient();
  const roundKey = `game_round:${gameId}:${roundId}`;

  try {
    const roundData = await client.hGetAll(roundKey);
    if (Object.keys(roundData).length === 0) {
      return null;
    }

    return {
      ...roundData,
      endTime: parseInt(roundData.endTime),
    };
  } catch (error) {
    console.error('Error getting game round:', error);
    throw error;
  }
}

async function getRoundSubmissions(gameId, roundId) {
  const client = getRedisClient();
  const submissionsKey = `submissions:${gameId}:${roundId}`;

  try {
    const submissions = await client.sMembers(submissionsKey);
    return submissions;
  } catch (error) {
    console.error('Error getting round submissions:', error);
    throw error;
  }
}

module.exports = {
  submitAnswer,
  createGameRound,
  getGameRound,
  getRoundSubmissions,
};
