export const CONSUME_REGISTRATION_AUTHORIZATION_SCRIPT = `
local raw = redis.call('GET',KEYS[1])

if not raw then
    return {'MISSING'}
end

local proof = cjson.decode(raw)

if proof.tokenHash ~= ARGV[1] 
    or proof.phone ~= ARGV[2] 
    or proof.deviceId ~= ARGV[3] then 
        return {'INVALID'}
end

redis.call('DEL',KEYS[1])

return{'CONSUMED'}
`;
