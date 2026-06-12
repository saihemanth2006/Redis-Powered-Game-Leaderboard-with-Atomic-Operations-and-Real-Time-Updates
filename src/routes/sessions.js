const express = require('express');
const sessionsService = require('../services/sessions');

const router = express.Router();

// POST /api/sessions - Create a new session
router.post('/', async (req, res) => {
  try {
    const { userId, ipAddress, deviceType } = req.body;

    if (!userId || !ipAddress || !deviceType) {
      return res.status(400).json({
        error: 'Missing required fields: userId, ipAddress, deviceType',
      });
    }

    const result = await sessionsService.createSession(
      userId,
      ipAddress,
      deviceType
    );

    res.status(201).json(result);
  } catch (error) {
    console.error('Error creating session:', error);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

module.exports = router;
