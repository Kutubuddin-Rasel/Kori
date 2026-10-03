export const VERIFY_OTP_SCRIPT = `
local failureRaw = redis.call('GET',KEYS[3])

local failureCount = 0

if failureRaw then 
    failureCount = tonumber(failureRaw)
end

local maxFailures = tonumber(ARGV[5])

local failureWindow = tonumber(ARGV[6])

if failureCount >= maxFailures then
    return {
        'TOO_MANY_ATTEMPTS',
        tostring(failureCount)
    }
end

local activeRaw = redis.call('GET',KEYS[1])

if not activeRaw then
    return {
        'NO_ACTIVE_CHALLENGE'
    }
end

local activeChallengeId = cjson.decode(activeRaw)

if activeChallengeId ~= ARGV[1] then
    return {'SUPERSEDED'}
end

local challengeRaw = redis.call('GET', KEYS[2])

if not challengeRaw then
    return {'CHALLENGE_MISSING'}
end

local challenge = cjson.decode(challengeRaw)

if challenge.phone ~= ARGV[2] or challenge.deviceId ~= ARGV[3] then
    return {'INVALID_CHALLENGE'}
end

if challenge.code ~= ARGV[4] then
    local count = redis.call('INCR',KEYS[3])

    redis.call(
      'EXPIRE',
      KEYS[3],
      failureWindow
    )
    
    if count >= maxFailures then
        return {
            'TOO_MANY_ATTEMPTS',
            tostring(count)
        }
    end

    return {
        'INVALID_OTP',
        tostring(count)
    }
end

redis.call(
  'DEL',
  KEYS[2]
)

redis.call(
  'DEL',
  KEYS[1]
)

redis.call(
  'DEL',
  KEYS[3]
)

return {
  'VERIFIED'
}
`;
