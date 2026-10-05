export const CONSUME_DEVICE_ENROLLMENT_AUTHORIZATION_SCRIPT = `
local raw = redis.call('GET',KEYS[1])

if not raw then
    return {'MISSING'}
end

local proof = cjson.decode(raw)

if proof.tokenHash ~= ARGV[1]
    or proof.userId ~= ARGV[2] 
    or proof.phone ~= ARGV[3] 
    or proof.deviceId ~= ARGV[4] then
        return{'INVALID'}
end

redis.call('DEL',KEYS[1])

return {'CONSUMED'}
`;
