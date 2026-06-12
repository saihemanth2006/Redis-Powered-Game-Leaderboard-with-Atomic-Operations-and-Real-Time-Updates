/**
 * Lua Scripts for Redis Atomic Operations
 * These scripts ensure consistency and prevent race conditions
 */

// Script 1: Invalidate old sessions and create a new one atomically
const invalidateOldSessionsScript = `
local userId = ARGV[1]
local newSessionId = ARGV[2]
local sessionKey = "session:" .. newSessionId
local userSessionsKey = "user_sessions:" .. userId
local oldSessionIds = redis.call('SMEMBERS', userSessionsKey)

-- Delete all old session hashes
for _, sessionId in ipairs(oldSessionIds) do
  redis.call('DEL', "session:" .. sessionId)
end

-- Clear the user sessions set and add only the new session
redis.call('DEL', userSessionsKey)
redis.call('SADD', userSessionsKey, newSessionId)

-- Set TTL for the new session (30 minutes = 1800 seconds)
redis.call('EXPIRE', sessionKey, 1800)
redis.call('EXPIRE', userSessionsKey, 1800)

return {sessionId = newSessionId}
`;

// Script 2: Increment score atomically and return new score
const incrementScoreScript = `
local leaderboardKey = "leaderboard:global"
local playerId = ARGV[1]
local points = tonumber(ARGV[2])

local newScore = redis.call('ZINCRBY', leaderboardKey, points, playerId)
return tonumber(newScore)
`;

// Script 3: Process game submission atomically
const submitAnswerScript = `
local gameId = ARGV[1]
local roundId = ARGV[2]
local playerId = ARGV[3]
local points = tonumber(ARGV[4])
local currentTime = tonumber(ARGV[5])

local roundKey = "game_round:" .. gameId .. ":" .. roundId
local submissionsKey = "submissions:" .. gameId .. ":" .. roundId
local leaderboardKey = "leaderboard:global"

-- Check if round exists
local roundExists = redis.call('EXISTS', roundKey)
if roundExists == 0 then
  return {status = "ERROR", code = "ROUND_NOT_FOUND"}
end

-- Get round end time
local endTime = tonumber(redis.call('HGET', roundKey, 'endTime'))
if not endTime then
  return {status = "ERROR", code = "INVALID_ROUND"}
end

-- Check if round is still active
if currentTime >= endTime then
  return {status = "ERROR", code = "ROUND_EXPIRED"}
end

-- Check if player already submitted
local alreadySubmitted = redis.call('SISMEMBER', submissionsKey, playerId)
if alreadySubmitted == 1 then
  return {status = "ERROR", code = "DUPLICATE_SUBMISSION"}
end

-- Record submission
redis.call('SADD', submissionsKey, playerId)

-- Update player score
local newScore = redis.call('ZINCRBY', leaderboardKey, points, playerId)

return {status = "SUCCESS", newScore = tonumber(newScore)}
`;

// Script 4: Get player rank and percentile atomically
const getPlayerStatsScript = `
local leaderboardKey = "leaderboard:global"
local playerId = ARGV[1]

-- Get player score
local score = redis.call('ZSCORE', leaderboardKey, playerId)
if not score then
  return {status = "NOT_FOUND"}
end

score = tonumber(score)

-- Get player rank (1-based, scores in descending order)
local rank = redis.call('ZREVRANK', leaderboardKey, playerId)
if not rank then
  return {status = "ERROR"}
end

rank = rank + 1 -- ZREVRANK returns 0-based index

-- Get total number of players
local totalPlayers = redis.call('ZCARD', leaderboardKey)

-- Calculate percentile
local percentile = ((totalPlayers - rank + 1) / totalPlayers) * 100

return {rank = rank, score = score, percentile = percentile, totalPlayers = totalPlayers}
`;

// Script 5: Delete session atomically (removes from both session and user_sessions)
const deleteSessionScript = `
local sessionId = ARGV[1]
local sessionKey = "session:" .. sessionId

-- Get userId from session
local userId = redis.call('HGET', sessionKey, 'userId')

-- Delete session hash
redis.call('DEL', sessionKey)

-- Remove from user sessions set
if userId then
  redis.call('SREM', "user_sessions:" .. userId, sessionId)
end

return {deleted = 1}
`;

module.exports = {
  invalidateOldSessionsScript,
  incrementScoreScript,
  submitAnswerScript,
  getPlayerStatsScript,
  deleteSessionScript,
};
