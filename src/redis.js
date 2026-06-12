const redis = require('redis');
let redisClient;

// Wrapper to provide API compatibility between redis-mock and redis client
function createMockRedisWrapper(mockClient) {
  return {
    // Redis commands with camelCase API (matching redis client)
    set: async (key, value) => {
      const result = mockClient.set(key, value);
      return Promise.resolve(result);
    },
    get: async (key) => {
      const result = mockClient.get(key);
      return Promise.resolve(result);
    },
    del: async (key) => {
      const result = mockClient.del(key);
      return Promise.resolve(result);
    },
    exists: async (key) => {
      const result = mockClient.exists(key);
      return Promise.resolve(result);
    },
    expire: async (key, seconds) => {
      const result = mockClient.expire(key, seconds);
      return Promise.resolve(result);
    },
    ttl: async (key) => {
      const result = mockClient.ttl(key);
      return Promise.resolve(result);
    },
    
    // Sorted set operations
    zAdd: async (key, options, ...args) => {
      let result;
      if (Array.isArray(options)) {
        result = mockClient.zadd(key, ...options);
      } else {
        result = mockClient.zadd(key, ...args);
      }
      return Promise.resolve(result);
    },
    zIncrBy: async (key, increment, member) => {
      const result = mockClient.zincrby(key, increment, member);
      return Promise.resolve(result);
    },
    zRevRange: async (key, start, stop, options) => {
      let result;
      if (options === 'WITHSCORES') {
        result = mockClient.zrevrange(key, start, stop, 'WITHSCORES');
      } else {
        result = mockClient.zrevrange(key, start, stop);
      }
      return Promise.resolve(result);
    },
    zRangeWithScores: async (key, start, stop, options) => {
      // Handle zRangeWithScores which returns { value, score } objects
      const rev = options && options.REV;
      const rawResults = rev 
        ? mockClient.zrevrange(key, start, stop, 'WITHSCORES')
        : mockClient.zrange(key, start, stop, 'WITHSCORES');
      
      // Parse raw results into { value, score } format
      const results = [];
      if (Array.isArray(rawResults)) {
        for (let i = 0; i < rawResults.length; i += 2) {
          results.push({
            value: rawResults[i],
            score: parseFloat(rawResults[i + 1]),
          });
        }
      }
      return Promise.resolve(results);
    },
    zRevRank: async (key, member) => {
      const result = mockClient.zrevrank(key, member);
      return Promise.resolve(result);
    },
    zScore: async (key, member) => {
      const result = mockClient.zscore(key, member);
      return Promise.resolve(result);
    },
    zCard: async (key) => {
      const result = mockClient.zcard(key);
      return Promise.resolve(result);
    },
    zRem: async (key, member) => {
      const result = mockClient.zrem(key, member);
      return Promise.resolve(result);
    },
    zRange: async (key, start, stop, options) => {
      let result;
      if (options === 'WITHSCORES') {
        result = mockClient.zrange(key, start, stop, 'WITHSCORES');
      } else {
        result = mockClient.zrange(key, start, stop);
      }
      return Promise.resolve(result);
    },
    
    // Hash operations
    hSet: async (key, field, value) => {
      const result = mockClient.hset(key, field, value);
      return Promise.resolve(result);
    },
    hGet: async (key, field) => {
      const result = mockClient.hget(key, field);
      return Promise.resolve(result);
    },
    hGetAll: async (key) => {
      const result = mockClient.hgetall(key);
      return Promise.resolve(result);
    },
    hDel: async (key, field) => {
      const result = mockClient.hdel(key, field);
      return Promise.resolve(result);
    },
    hExists: async (key, field) => {
      const result = mockClient.hexists(key, field);
      return Promise.resolve(result);
    },
    
    // Set operations
    sAdd: async (key, member) => {
      const result = mockClient.sadd(key, member);
      return Promise.resolve(result);
    },
    sRem: async (key, member) => {
      const result = mockClient.srem(key, member);
      return Promise.resolve(result);
    },
    sIsMember: async (key, member) => {
      const result = mockClient.sismember(key, member);
      return Promise.resolve(result);
    },
    sMembers: async (key) => {
      const result = mockClient.smembers(key);
      return Promise.resolve(result);
    },
    
    // List operations
    lPush: async (key, value) => {
      const result = mockClient.lpush(key, value);
      return Promise.resolve(result);
    },
    lRange: async (key, start, stop) => {
      const result = mockClient.lrange(key, start, stop);
      return Promise.resolve(result);
    },
    
    // Other operations
    ping: async () => {
      const result = mockClient.ping();
      return Promise.resolve(result);
    },
    subscribe: (channel, callback) => {
      mockClient.subscribe(channel, callback);
      return Promise.resolve();
    },
    publish: async (channel, message) => {
      const result = mockClient.publish(channel, message);
      return Promise.resolve(result);
    },
    eval: async (script, numKeys, ...args) => {
      const result = mockClient.eval(script, numKeys, ...args);
      return Promise.resolve(result);
    },
    evalSha: async (sha, numKeys, ...args) => {
      const result = mockClient.evalsha(sha, numKeys, ...args);
      return Promise.resolve(result);
    },
    scriptLoad: async (script) => {
      const result = mockClient.script('LOAD', script);
      return Promise.resolve(result);
    },
    connect: async () => Promise.resolve(),
    disconnect: async () => Promise.resolve(),
    quit: async () => Promise.resolve(),
  };
}

async function initializeRedis() {
  const useMockRedis = process.env.USE_MOCK_REDIS === 'true';
  
  if (useMockRedis) {
    // Use redis-mock for local development without actual Redis
    const redisMock = require('redis-mock');
    const mockClient = redisMock.createClient();
    redisClient = createMockRedisWrapper(mockClient);
    console.log('🚀 Using Redis Mock for local development (in-memory)');
  } else {
    // Use real Redis client
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    
    redisClient = redis.createClient({
      url: redisUrl,
      socket: {
        reconnectStrategy: (retries) => Math.min(retries * 50, 500),
      },
    });

    redisClient.on('error', (err) => {
      console.error('Redis Client Error:', err);
    });

    redisClient.on('connect', () => {
      console.log('Redis Client Connected');
    });

    await redisClient.connect();
  }
  
  // Verify connection
  const pong = await redisClient.ping();
  console.log('✓ Redis Ping Response:', pong);
  
  return redisClient;
}

function getRedisClient() {
  if (!redisClient) {
    throw new Error('Redis client not initialized');
  }
  return redisClient;
}

async function closeRedis() {
  if (redisClient) {
    await redisClient.quit();
  }
}

module.exports = {
  initializeRedis,
  getRedisClient,
  closeRedis,
};
