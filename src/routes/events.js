const express = require('express');
const eventsService = require('../services/events');

const router = express.Router();

// GET /api/events - SSE endpoint for real-time events
router.get('/events', async (req, res) => {
  // Set headers for Server-Sent Events
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  // Add this response to SSE subscribers
  eventsService.addSseSubscriber(res);

  // Send a comment as a heartbeat
  res.write(': SSE Connection Established\n\n');

  // Send keepalive every 30 seconds
  const keepaliveInterval = setInterval(() => {
    res.write(': keepalive\n\n');
  }, 30000);

  // Handle client disconnect
  req.on('close', () => {
    clearInterval(keepaliveInterval);
    eventsService.removeSseSubscriber(res);
  });

  res.on('error', () => {
    clearInterval(keepaliveInterval);
    eventsService.removeSseSubscriber(res);
  });
});

module.exports = router;
