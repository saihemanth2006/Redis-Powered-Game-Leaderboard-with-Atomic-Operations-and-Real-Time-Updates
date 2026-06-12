const express = require('express');
const leaderboardService = require('../services/leaderboard');
const eventsService = require('../services/events');

const router = express.Router();

// POST /api/leaderboard/scores - Update player score
router.post('/scores', async (req, res) => {
  try {
    const { playerId, points } = req.body;

    if (!playerId || typeof points !== 'number') {
      return res.status(400).json({
        error: 'Missing or invalid fields: playerId, points',
      });
    }

    const result = await leaderboardService.updateScore(playerId, points);

    // Publish event for real-time updates
    await eventsService.publishEvent('leaderboard_updated', {
      playerId: result.playerId,
      newScore: result.newScore,
      points,
      timestamp: new Date().toISOString(),
    });

    // Broadcast to SSE clients
    eventsService.broadcastToSSE('leaderboard_updated', {
      playerId: result.playerId,
      newScore: result.newScore,
      points,
      timestamp: new Date().toISOString(),
    });

    res.status(200).json(result);
  } catch (error) {
    console.error('Error updating score:', error);
    res.status(500).json({ error: 'Failed to update score' });
  }
});

// GET /api/leaderboard/top/:count - Get top N players
router.get('/top/:count', async (req, res) => {
  try {
    const count = parseInt(req.params.count);

    if (isNaN(count) || count < 1 || count > 1000) {
      return res.status(400).json({
        error: 'Invalid count parameter. Must be between 1 and 1000',
      });
    }

    const topPlayers = await leaderboardService.getTopPlayers(count);
    res.status(200).json(topPlayers);
  } catch (error) {
    console.error('Error getting top players:', error);
    res.status(500).json({ error: 'Failed to get top players' });
  }
});

// GET /api/leaderboard/player/:playerId - Get player rank and stats
router.get('/player/:playerId', async (req, res) => {
  try {
    const { playerId } = req.params;

    if (!playerId) {
      return res.status(400).json({
        error: 'Missing playerId parameter',
      });
    }

    const playerStats = await leaderboardService.getPlayerStats(playerId);

    if (!playerStats) {
      return res.status(404).json({
        error: 'Player not found on leaderboard',
      });
    }

    res.status(200).json(playerStats);
  } catch (error) {
    console.error('Error getting player stats:', error);
    res.status(500).json({ error: 'Failed to get player stats' });
  }
});

module.exports = router;
