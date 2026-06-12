require('dotenv').config();

const express = require('express');
const path = require('path');
const { initializeRedis, closeRedis } = require('./redis');
const { subscribeToEvents, broadcastToSSE } = require('./services/events');

// Import routes
const sessionsRoutes = require('./routes/sessions');
const leaderboardRoutes = require('./routes/leaderboard');
const gameRoutes = require('./routes/game');
const adminRoutes = require('./routes/admin');
const eventsRoutes = require('./routes/events');

const app = express();
const PORT = process.env.API_PORT || 3000;

// Middleware
app.use(express.json());

// Serve static frontend
app.use(express.static(path.join(__dirname, '..', 'public')));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// API Routes
app.post('/api/sessions', sessionsRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/game', gameRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', eventsRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unexpected error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

let subscriber = null;

// Start server
async function start() {
  try {
    console.log('Initializing Redis connection...');
    await initializeRedis();
    console.log('Redis initialized successfully');

    // Subscribe to game events channel
    console.log('Setting up event subscriber...');
    subscriber = await subscribeToEvents((event) => {
      console.log('Event received:', event);
      // Broadcast to all SSE clients
      broadcastToSSE(event.event, event.data);
    });

    app.listen(PORT, () => {
      console.log(`API Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  if (subscriber) {
    await subscriber.disconnect();
  }
  await closeRedis();
  process.exit(0);
});

start();
