import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from 'src/app.setup';

describe('Application bootstrap (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves the root endpoint under the production API prefix', async () => {
    await request(app.getHttpServer())
      .get('/api/v1')
      .expect(200)
      .expect('Hello World!');
  });

  it('does not expose application routes outside the API prefix', async () => {
    const response = await request(app.getHttpServer()).get('/').expect(404);

    expect(response.body).toEqual(
      expect.objectContaining({
        success: false,
        path: '/',
      }),
    );
  });

  it('uses the production validation and error envelope', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/send-otp')
      .send({
        phone: '+8801712345678',
        deviceId: 'device-1',
        unexpectedField: 'not-allowed',
      })
      .expect(400);

    expect(response.body).toEqual(
      expect.objectContaining({
        success: false,
        path: '/api/v1/auth/send-otp',
      }),
    );

    expect(response.body.message).toEqual(
      expect.arrayContaining(['property unexpectedField should not exist']),
    );
  });

  it('does not expose an unverified public Add Money route', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/transactions/add-money')
      .send({
        amountMinorUnits: '10000',
        bankGatewayToken: 'client-claimed-payment',
      })
      .expect(404);

    expect(response.body).toEqual(
      expect.objectContaining({
        success: false,
        path: '/api/v1/transactions/add-money',
      }),
    );
  });
});
