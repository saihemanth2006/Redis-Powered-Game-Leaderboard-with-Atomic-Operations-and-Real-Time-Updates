// Test redis-mock behavior
const redisMock = require('redis-mock');

async function test() {
  const client = redisMock.createClient();
  
  console.log('Testing redis-mock API:');
  
  // Test zadd
  console.log('\n1. Testing zadd:');
  const r1 = client.zadd('leaderboard', 100, 'player1');
  console.log('zadd result:', r1);
  
  // Test zincrby
  console.log('\n2. Testing zincrby:');
  const r2 = client.zincrby('leaderboard', 50, 'player1');
  console.log('zincrby result:', r2);
  
  // Test zrevrange
  console.log('\n3. Testing zrevrange:');
  const r3 = client.zrevrange('leaderboard', 0, -1, 'WITHSCORES');
  console.log('zrevrange result:', r3);
  
  // Test zcard
  console.log('\n4. Testing zcard:');
  const r4 = client.zcard('leaderboard');
  console.log('zcard result:', r4);
  
  // Test zrevrank
  console.log('\n5. Testing zrevrank:');
  const r5 = client.zrevrank('leaderboard', 'player1');
  console.log('zrevrank result:', r5);
  
  // Test zscore
  console.log('\n6. Testing zscore:');
  const r6 = client.zscore('leaderboard', 'player1');
  console.log('zscore result:', r6);
}

test().catch(console.error);
