const express = require('express');
const sessionsService = require('../services/sessions');

const router = express.Router();

// GET /api/admin/sessions/user/:userId - Get all active sessions for a user
router.get('/sessions/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        error: 'Missing userId parameter',
      });
    }

    const sessions = await sessionsService.getUserSessions(userId);
    res.status(200).json(sessions);
  } catch (error) {
    console.error('Error getting user sessions:', error);
    res.status(500).json({ error: 'Failed to get user sessions' });
  }
});

// DELETE /api/admin/sessions/:sessionId - Invalidate a session
router.delete('/sessions/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    if (!sessionId) {
      return res.status(400).json({
        error: 'Missing sessionId parameter',
      });
    }

    await sessionsService.deleteSession(sessionId);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting session:', error);
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

module.exports = router;
