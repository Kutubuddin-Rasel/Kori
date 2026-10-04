import Redis from 'ioredis';
import { resolve } from 'path';
import { config } from 'dotenv';
import { VERIFY_OTP_SCRIPT } from '../scripts/verify-otp.script';

describe('[Integration] verify-otp.script - atomic concurrency', () => {
  let redis: Redis;

  // VerifyOtpDto
  const phone = '+8801712345678';
  const challengeId = '00000000-0000-4000-8000-000000000001';
  const deviceId = 'device-1';
  const otp = '001234';

  // Eval Keys
  const activeKey = `auth:otp:{${phone}}:active`;
  const challengeKey = `auth:otp:{${phone}}:challenge:${challengeId}`;
  const failureKey = `auth:otp:{${phone}}:failures`;
  const keys: Array<string> = [activeKey, challengeKey, failureKey];
  // Eval ARGS
  const MAX_FAILURES = '10';
  const FAILURE_WINDOW = '600';
  const args: Array<string> = [
    challengeId,
    phone,
    deviceId,
    otp,
    MAX_FAILURES,
    FAILURE_WINDOW,
  ];

  beforeAll(async () => {
    config({ path: resolve(__dirname, '../../../../.env') });

    redis = new Redis({
      host: process.env.REDIS_HOST,
      port: Number(process.env.REDIS_PORT),
      password: process.env.REDIS_PASSWORD,
    });

    await redis.ping();
  });

  afterAll(async () => {
    await redis.quit();
  });

  beforeEach(async () => {
    await redis.set(activeKey, JSON.stringify(challengeId), 'EX', 30);
    await redis.set(
      challengeKey,
      JSON.stringify({ phone, deviceId, code: otp }),
      'EX',
      30,
    );
    await redis.del(failureKey);
  });

  afterEach(async () => {
    await redis.del(activeKey, challengeKey, failureKey);
  });

  it('exactly one of two concurrent EVAL calls return VERIFIED', async () => {
    const evalOnce = () =>
      redis.eval(VERIFY_OTP_SCRIPT, 3, ...keys, ...args) as Promise<string[]>;

    const [resultA, resultB] = await Promise.all([evalOnce(), evalOnce()]);
    const statuses = [resultA[0], resultB[0]];

    const verified = statuses.filter((s) => s === 'VERIFIED');
    const notVerified = statuses.filter((s) => s !== 'VERIFIED');

    expect(verified).toHaveLength(1);
    expect(notVerified).toHaveLength(1);
    expect(['NO_ACTIVE_CHALLENGE', 'CHALLENGE_MISSING']).toContain(
      notVerified[0],
    );
  });
});
