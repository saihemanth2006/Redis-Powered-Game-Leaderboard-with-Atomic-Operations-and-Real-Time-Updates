const { getRedisClient } = require('../redis');

const sseSubscribers = [];

async function subscribeToEvents(callback) {
  const client = getRedisClient();
  const eventChannel = process.env.GAME_EVENT_CHANNEL || 'game:events';

  // Handle redis-mock and regular Redis differently
  if (process.env.USE_MOCK_REDIS === 'true') {
    // For redis-mock, subscribe directly
    client.subscribe(eventChannel, (message) => {
      try {
        const event = JSON.parse(message);
        callback(event);
      } catch (error) {
        console.error('Error parsing event message:', error);
      }
    });
  } else {
    // For real Redis, create a duplicate connection for subscription
    const subscriber = client.duplicate();
    await subscriber.connect();

    subscriber.subscribe(eventChannel, (message) => {
      try {
        const event = JSON.parse(message);
        callback(event);
      } catch (error) {
        console.error('Error parsing event message:', error);
      }
    });
  }

  return client;
}

async function publishEvent(eventName, data) {
  const client = getRedisClient();
  const eventChannel = process.env.GAME_EVENT_CHANNEL || 'game:events';

  try {
    const eventMessage = {
      event: eventName,
      timestamp: new Date().toISOString(),
      data,
    };

    await client.publish(eventChannel, JSON.stringify(eventMessage));
  } catch (error) {
    console.error('Error publishing event:', error);
    throw error;
  }
}

function addSseSubscriber(res) {
  sseSubscribers.push(res);
}

function removeSseSubscriber(res) {
  const index = sseSubscribers.indexOf(res);
  if (index > -1) {
    sseSubscribers.splice(index, 1);
  }
}

function broadcastToSSE(eventName, data) {
  const message = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;

  sseSubscribers.forEach((res) => {
    try {
      res.write(message);
    } catch (error) {
      console.error('Error writing to SSE client:', error);
    }
  });
}

module.exports = {
  subscribeToEvents,
  publishEvent,
  addSseSubscriber,
  removeSseSubscriber,
  broadcastToSSE,
};
