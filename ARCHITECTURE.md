# Architecture and Implementation Notes

## High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser Client                        │
│              (Game Dashboard + SSE Listener)                 │
└────────────────────┬────────────────────────────────────────┘
                     │ HTTP/SSE
                     │
┌────────────────────▼────────────────────────────────────────┐
│                   Express.js API Server                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │             Route Handlers Layer                      │  │
│  ├──────────────────────────────────────────────────────┤  │
│  │  • POST /api/sessions          (Session Management)  │  │
│  │  • POST /api/leaderboard/scores (Score Updates)     │  │
│  │  • GET  /api/leaderboard/top/:count                 │  │
│  │  • GET  /api/leaderboard/player/:playerId           │  │
│  │  • POST /api/game/submit       (Atomic Operations)  │  │
│  │  • GET  /api/events            (SSE Streaming)      │  │
│  │  • GET  /api/admin/sessions/user/:userId            │  │
│  │  • DELETE /api/admin/sessions/:sessionId            │  │
│  └──────────────────────────────────────────────────────┘  │
│                     ↓                                        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │           Service Layer (Business Logic)             │  │
│  ├──────────────────────────────────────────────────────┤  │
│  │  • SessionService   - Session lifecycle management   │  │
│  │  • LeaderboardService - Ranking and stats           │  │
│  │  • GameService - Round management & submissions     │  │
│  │  • EventService - Pub/Sub and SSE broadcasting      │  │
│  └──────────────────────────────────────────────────────┘  │
│                     ↓                                        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │       Redis Client Layer (redis-npm v4.6)           │  │
│  ├──────────────────────────────────────────────────────┤  │
│  │  • Command Executor - Redis operations              │  │
│  │  • Lua Script Runner - Atomic transactions          │  │
│  │  • Pub/Sub Subscriber - Event channel listener      │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
└────────────────────┬─────────────────────┬──────────────────┘
                     │ TCP Port 6379       │
    ┌────────────────▼────────────┬────────▼────────────────┐
    │                              │                        │
┌───▼──────────────────────────────┴─────┐  ┌──────────────▼──┐
│    Redis Data Store (In-Memory)       │  │ Pub/Sub Channel │
├───────────────────────────────────────┤  │  game:events    │
│                                       │  └──────────────────┘
│  Data Structures:                     │
│  ─────────────────                    │
│                                       │
│  Sessions (Hash):                     │
│  ├─ session:{sessionId}               │
│  │  ├─ userId                         │
│  │  ├─ ipAddress                      │
│  │  ├─ deviceType                     │
│  │  ├─ createdAt                      │
│  │  └─ lastActive                     │
│  │  TTL: 30 min (sliding)             │
│  │                                    │
│  └─ user_sessions:{userId} (Set)      │
│     └─ Members: [sessionId, ...]      │
│     TTL: 30 min                       │
│                                       │
│  Leaderboard (Sorted Set):            │
│  ├─ leaderboard:global                │
│  │  └─ {playerId: score} * N          │
│  │  Encoding: ziplist → skiplist      │
│  │  Score: descending order           │
│  │  No expiration                     │
│  │                                    │
│  └─ leaderboard:game:{gameId}         │
│     └─ Game-specific rankings         │
│                                       │
│  Game Rounds (Hash):                  │
│  ├─ game_round:{gameId}:{roundId}     │
│  │  ├─ gameId                         │
│  │  ├─ roundId                        │
│  │  ├─ endTime (Unix timestamp)       │
│  │  └─ createdAt                      │
│  │                                    │
│  └─ submissions:{gameId}:{roundId}    │
│     └─ Members: [playerId, ...]       │
│     Tracks submitted players          │
│                                       │
│  Lua Scripts Storage (Client-side):   │
│  ├─ invalidateOldSessionsScript       │
│  ├─ incrementScoreScript              │
│  ├─ submitAnswerScript                │
│  ├─ getPlayerStatsScript              │
│  └─ deleteSessionScript               │
│                                       │
│  Memory Analysis:                     │
│  • Per session: ~246 bytes            │
│  • Per leaderboard: ~32 bytes         │
│  • 50k sessions: ~12.5 MB             │
│  • 100k leaderboard: ~3.2 MB          │
│                                       │
└───────────────────────────────────────┘
```

## Project Structure

```
redis-game-leaderboard/
├── src/
│   ├── index.js                    # Main server entry point
│   ├── redis.js                    # Redis connection management
│   ├── lua-scripts.js              # All Lua script definitions
│   ├── routes/
│   │   ├── sessions.js             # Session endpoints
│   │   ├── leaderboard.js          # Leaderboard endpoints
│   │   ├── game.js                 # Game submission endpoints
│   │   ├── admin.js                # Admin session endpoints
│   │   └── events.js               # SSE streaming endpoint
│   └── services/
│       ├── sessions.js             # Session business logic
│       ├── leaderboard.js          # Leaderboard business logic
│       ├── game.js                 # Game logic with Lua
│       └── events.js               # Event pub/sub management
│
├── __tests__/
│   └── integration/
│       └── api.test.js             # Integration tests
│
├── docker-compose.yml              # Docker orchestration
├── Dockerfile                      # API service image
├── .env.example                    # Environment template
├── .gitignore                      # Git ignore rules
├── jest.config.js                  # Jest configuration
├── package.json                    # Dependencies
├── README.md                       # Main documentation
├── MEMORY_ANALYSIS.md              # Memory optimization analysis
├── TESTING.md                      # Testing guide
├── test-api.sh                     # Bash testing script
├── test-api.bat                    # Windows testing script
└── submission.json                 # Submission config

Total: 25+ files organized by concern
```

## Data Flow Examples

### Example 1: Session Creation with Invalidation

```
Client Request:
POST /api/sessions
{userId: "user-123", ipAddress: "1.1.1.1", deviceType: "mobile"}
                    │
                    ▼
        SessionService.createSession()
                    │
        ┌───────────┴──────────────┐
        │                          │
        ▼                          ▼
  Get old sessions        Create new session
  from Redis             and store in Redis
  user_sessions:         session:{newId}
  user-123
        │                          │
        └───────────┬──────────────┘
                    │
        ┌───────────▼──────────┐
        │ Delete old sessions  │
        │ (atomically within   │
        │  service layer)      │
        └──────────┬───────────┘
                   │
        ┌──────────▼──────────────┐
        │ Update index atomically │
        │ user_sessions:user-123  │
        │ ← now contains only new  │
        │   sessionId             │
        └──────────┬──────────────┘
                   │
                   ▼
        Response (201):
        {sessionId: "550e..."}
```

### Example 2: Atomic Game Submission

```
Client Request:
POST /api/game/submit
{gameId: "g1", roundId: "r1", playerId: "p1", answer: "A", points: 10}
                    │
                    ▼
        GameService.submitAnswer()
                    │
    ┌───────────────┼────────────────┐
    │               │                │
    ▼               ▼                ▼
 Check round   Check if player    Check if round
 exists        already submitted   is still active
 game_round:   submissions:        Current time
 g1:r1         g1:r1              vs endTime
    │               │                │
    └───────────────┼────────────────┘
                    │
        ┌───────────▼──────────┐
        │ All checks passed?   │
        └───┬──────────────┬───┘
            │              │
           YES            NO
            │              │
            ▼              ▼
    ┌────────────────┐   Return error
    │ Atomically:    │   (DUPLICATE or
    │ • Add to set   │    ROUND_EXPIRED)
    │ • Increment    │
    │   score        │   Status codes:
    │ • Return new   │   • 400 DUPLICATE
    │   score        │   • 403 EXPIRED
    │                │
    │ All happens    │
    │ in Redis       │
    │ (Lua script)   │
    └────────┬───────┘
             │
             ▼
    Response (200):
    {status: "SUCCESS",
     newScore: 750}
```

### Example 3: Real-Time Leaderboard Update via SSE

```
Client A: GET /api/events
(opens SSE connection, stays open)
          │
          ▼
    Service creates SSE
    subscription connection
          │
          ▼
    Client B: POST /api/leaderboard/scores
    {playerId: "player-x", points: 50}
              │
              ▼
    LeaderboardService.updateScore()
              │
              ▼
    Redis: ZINCRBY leaderboard:global 50 player-x
              │
              ▼
    EventService.publishEvent()
              │
              ▼
    Redis: PUBLISH game:events
    "{event: 'leaderboard_updated', data: {...}}"
              │
              ▼
    SSE Subscriber receives message
              │
              ▼
    Service broadcasts to all SSE clients
              │
              ▼
    Client A receives:
    event: leaderboard_updated
    data: {playerId: "player-x", newScore: 50, ...}
```

## Concurrency Safety Mechanisms

### Mechanism 1: Lua Scripting for Atomicity

**Problem**: Multi-step operations like "check then update" can have race conditions

**Solution**: Wrap in Lua script executed atomically on Redis server

```lua
-- Race-free duplicate check
if redis.call('SISMEMBER', submissionsKey, playerId) == 1 then
  return {status = "ERROR", code = "DUPLICATE_SUBMISSION"}
end
redis.call('SADD', submissionsKey, playerId)
```

### Mechanism 2: Redis Data Structure Properties

**Problem**: Maintaining consistent indexes

**Solution**: Use Redis data structure guarantees

- **Sorted Set** is always kept sorted
- **Set** prevents duplicates automatically
- **Hash field operations** are atomic

### Mechanism 3: Connection Pooling

**Problem**: Exhausting connection limit under high load

**Solution**: redis-npm v4.6 implements automatic connection pooling

```javascript
// Single pool manages all connections
const client = redis.createClient({
  url: redisUrl,
  socket: {
    reconnectStrategy: (retries) => Math.min(retries * 50, 500),
  },
});
```

## Performance Optimizations

### 1. Encoding Selection

Redis automatically chooses optimal encoding:

- **Small Sorted Sets** (< 128 entries): Ziplist (more memory efficient)
- **Large Sorted Sets** (> 128 entries): Skip list (faster operations)

Our system automatically scales to the right encoding as the leaderboard grows.

### 2. TTL-Based Memory Management

Session data automatically expires:

```javascript
await client.expire(sessionKey, 1800); // 30 minutes
```

No manual cleanup needed—Redis removes expired keys automatically.

### 3. Connection Reuse

All operations share a single Redis connection with automatic pooling, minimizing overhead.

### 4. Binary-Safe Operations

Redis binary protocol handles all data types safely without serialization overhead.

## Testing Strategy

### Unit Tests

- Mock Redis client
- Test business logic in isolation
- Verify error conditions

### Integration Tests

- Real Redis instance
- Full request/response cycle
- Verify HTTP status codes and response bodies

### Load Tests

- Apache Bench or similar
- Target: > 1000 RPS
- Latency: < 10ms P50, < 20ms P95

### Concurrency Tests

- Simultaneous operations
- Verify no race conditions
- Duplicate submission prevention

### Manual Verification

- Use curl to test each endpoint
- Verify Redis data consistency
- Check SSE event delivery

## Deployment Checklist

- [ ] Docker image builds successfully
- [ ] docker-compose up starts all services
- [ ] Health checks pass within 2 minutes
- [ ] All endpoints respond correctly
- [ ] Lua scripts execute atomically
- [ ] SSE broadcasts events in real-time
- [ ] Session invalidation works atomically
- [ ] Duplicate submissions rejected
- [ ] Leaderboard queries < 10ms
- [ ] Memory usage within limits
- [ ] No connection leaks under load

## Future Enhancements

1. **Redis Cluster**: Horizontal scaling for million-player leaderboards
2. **Sentinel**: High availability with automatic failover
3. **Redis Streams**: Event audit log for compliance
4. **Geospatial**: Regional leaderboards using GEO commands
5. **Bloom Filters**: Fast duplicate detection across game rounds
6. **Time Series**: Performance monitoring and analytics
7. **ACL**: Fine-grained access control per user
8. **Modules**: Custom commands for business logic

---

## Key Insights

1. **Lua Scripts are Essential**: They eliminate entire classes of race conditions by guaranteeing atomicity at the Redis level.

2. **Data Structure Choice Matters**: Using Sorted Sets instead of sorted arrays or databases dramatically improves performance (O(log n) vs O(n)).

3. **Memory Efficiency Scales**: Even with 100k+ leaderboard entries, Redis memory usage remains under 5 MB—a tiny fraction of database alternatives.

4. **Real-Time is Achievable**: SSE + Pub/Sub provides sub-second event delivery with simple HTTP connections.

5. **Horizontal Thinking**: Redis wasn't designed for complex queries, but for simple, fast operations executed at scale. The solution embraces this constraint.

---

For detailed API documentation, see [README.md](README.md)
For memory analysis, see [MEMORY_ANALYSIS.md](MEMORY_ANALYSIS.md)
For testing procedures, see [TESTING.md](TESTING.md)
