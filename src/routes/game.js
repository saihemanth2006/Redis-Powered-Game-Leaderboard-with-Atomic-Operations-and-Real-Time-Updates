const express = require('express');
const gameService = require('../services/game');
const eventsService = require('../services/events');

const router = express.Router();

// POST /api/game/rounds - Create a game round
router.post('/rounds', async (req, res) => {
  try {
    const { gameId, roundId, endTime } = req.body;

    if (!gameId || !roundId || !endTime) {
      return res.status(400).json({
        error: 'Missing required fields: gameId, roundId, endTime',
      });
    }

    const result = await gameService.createGameRound(gameId, roundId, endTime);
    res.status(201).json(result);
  } catch (error) {
    console.error('Error creating game round:', error);
    res.status(500).json({ error: 'Failed to create game round' });
  }
});

// POST /api/game/submit - Submit an answer
router.post('/submit', async (req, res) => {
  try {
    const { gameId, roundId, playerId, answer } = req.body;
    const points = req.body.points || 10; // Default 10 points

    if (!gameId || !roundId || !playerId || !answer) {
      return res.status(400).json({
        error: 'Missing required fields: gameId, roundId, playerId, answer',
      });
    }

    const result = await gameService.submitAnswer(
      gameId,
      roundId,
      playerId,
      answer,
      points
    );

    if (result.status === 'ERROR') {
      const statusCode =
        result.code === 'ROUND_EXPIRED'
          ? 403
          : result.code === 'DUPLICATE_SUBMISSION'
          ? 400
          : 400;

      return res.status(statusCode).json(result);
    }

    // Publish event
    await eventsService.publishEvent('game_submission', {
      gameId,
      roundId,
      playerId,
      points,
      newScore: result.newScore,
      timestamp: new Date().toISOString(),
    });

    // Broadcast to SSE
    eventsService.broadcastToSSE('game_submission', {
      gameId,
      roundId,
      playerId,
      points,
      newScore: result.newScore,
      timestamp: new Date().toISOString(),
    });

    res.status(200).json(result);
  } catch (error) {
    console.error('Error submitting answer:', error);
    res.status(500).json({ error: 'Failed to submit answer' });
  }
});

// GET /api/game/rounds/:gameId/:roundId - Get game round info
router.get('/rounds/:gameId/:roundId', async (req, res) => {
  try {
    const { gameId, roundId } = req.params;

    const round = await gameService.getGameRound(gameId, roundId);

    if (!round) {
      return res.status(404).json({
        error: 'Game round not found',
      });
    }

    res.status(200).json(round);
  } catch (error) {
    console.error('Error getting game round:', error);
    res.status(500).json({ error: 'Failed to get game round' });
  }
});

module.exports = router;
