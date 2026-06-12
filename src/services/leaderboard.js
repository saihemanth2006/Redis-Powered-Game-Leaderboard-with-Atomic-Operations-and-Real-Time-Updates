const { getRedisClient } = require('../redis');
const { incrementScoreScript, getPlayerStatsScript } = require('../lua-scripts');

async function updateScore(playerId, points) {
  const client = getRedisClient();
  const leaderboardKey = 'leaderboard:global';

  try {
    // Atomically increment score
    const newScore = await client.zIncrBy(leaderboardKey, points, playerId);
    return {
      playerId,
      newScore: parseFloat(newScore),
    };
  } catch (error) {
    console.error('Error updating score:', error);
    throw error;
  }
}

async function getTopPlayers(count) {
  const client = getRedisClient();
  const leaderboardKey = 'leaderboard:global';

  try {
    // Get top N players with scores in descending order
    const results = await client.zRangeWithScores(
      leaderboardKey,
      0,
      count - 1,
      { REV: true }
    );

    const topPlayers = results.map((result, index) => ({
      rank: index + 1,
      playerId: result.value,
      score: parseFloat(result.score),
    }));

    return topPlayers;
  } catch (error) {
    console.error('Error getting top players:', error);
    throw error;
  }
}

async function getPlayerStats(playerId) {
  const client = getRedisClient();
  const leaderboardKey = 'leaderboard:global';

  try {
    // Get player score
    const score = await client.zScore(leaderboardKey, playerId);
    if (score === null) {
      return null;
    }

    // Get player rank (0-based, so add 1 for 1-based ranking)
    const rank = await client.zRevRank(leaderboardKey, playerId);
    if (rank === null) {
      return null;
    }

    // Get total players
    const totalPlayers = await client.zCard(leaderboardKey);

    // Calculate percentile (players ranked better or equal / total * 100)
    const percentile = ((totalPlayers - rank) / totalPlayers) * 100;

    // Get nearby players (2 above, 2 below)
    const aboveRank = Math.max(0, rank - 2);
    const belowRank = rank + 1;

    const above = await client.zRangeWithScores(
      leaderboardKey,
      aboveRank,
      rank - 1,
      { REV: true }
    );

    const below = await client.zRangeWithScores(
      leaderboardKey,
      belowRank,
      belowRank + 1,
      { REV: true }
    );

    const abovePlayers = above.map((result, index) => ({
      rank: rank - above.length + index + 1,
      playerId: result.value,
      score: parseFloat(result.score),
    }));

    const belowPlayers = below.map((result, index) => ({
      rank: rank + index + 2,
      playerId: result.value,
      score: parseFloat(result.score),
    }));

    return {
      playerId,
      score: parseFloat(score),
      rank: rank + 1,
      percentile: parseFloat(percentile.toFixed(1)),
      nearbyPlayers: {
        above: abovePlayers,
        below: belowPlayers,
      },
    };
  } catch (error) {
    console.error('Error getting player stats:', error);
    throw error;
  }
}

module.exports = {
  updateScore,
  getTopPlayers,
  getPlayerStats,
};
