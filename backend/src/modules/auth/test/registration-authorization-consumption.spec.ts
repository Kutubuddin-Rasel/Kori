import Redis from 'ioredis';
import { resolve } from 'path';
import { config } from 'dotenv';
import { createHash } from 'crypto';
import { CONSUME_REGISTRATION_AUTHORIZATION_SCRIPT } from '../scripts/consume-registration-authorization.script';

describe('[Integration] consume-registration-autorization.script - atomic concurrency', () => {
  let redis: Redis;

  const phone = '+8801712345678';
  const deviceId = 'device-1';
  const token = 'test-token-abc';
  const tokenHash = createHash('sha256').update(token).digest('hex');

  const key = `auth:registration:{${phone}}:authorization`;

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
    await redis.set(
      key,
      JSON.stringify({ tokenHash, phone, deviceId }),
      'EX',
      30,
    );
  });

  afterEach(async () => {
    await redis.del(key);
  });

  it('exactly one of two concurrent EVAL calls return CONSUMED', async () => {
    const evalOnce = () =>
      redis.eval(
        CONSUME_REGISTRATION_AUTHORIZATION_SCRIPT,
        1,
        key,
        tokenHash,
        phone,
        deviceId,
      ) as Promise<string[]>;

    const [resultA, resultB] = await Promise.all([evalOnce(), evalOnce()]);
    const statuses = [resultA[0], resultB[0]];

    const consumed = statuses.filter((s) => s === 'CONSUMED');
    const notConsumed = statuses.filter((s) => s !== 'CONSUMED');

    expect(consumed).toHaveLength(1);
    expect(notConsumed).toHaveLength(1);
    expect(notConsumed[0]).toBe('MISSING');
  });
});
