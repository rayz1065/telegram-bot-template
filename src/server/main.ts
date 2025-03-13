import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { Bot, webhookCallback } from 'grammy';
import { MyContext } from '../context.js';
import { AppConfig } from '../config.js';
import { Logger } from '../logger.js';

type Dependencies = {
  bot: Bot<MyContext>;
  logger: Logger;
  config: AppConfig;
};

export function startServer({ bot, logger, config }: Dependencies) {
  const app = new Hono();

  const port = 3000;
  logger.info(`Server is running on port ${port}`);

  app.get('/ping', (c) => {
    return c.json({
      ok: true,
      result: {
        pong: true,
      },
    });
  });

  if (config.USE_WEBHOOK) {
    app.post('/webhook', async (c) => {
      try {
        await c.req.json();
      } catch {
        return c.json({ ok: false, error: 'Invalid body' }, 400);
      }
      return await webhookCallback(bot, 'hono', {
        secretToken: config.WEBHOOK_SECRET,
      })(c);
    });
  }

  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      if (err.status < 500) {
        logger.info(err, 'client error');
      } else {
        logger.error(err, 'server error');
      }
      return err.getResponse();
    }

    logger.error(err, 'unexpected error');
    return c.json({ ok: false, error: 'Internal Server Error' }, 500);
  });

  const server = serve({
    fetch: app.fetch,
    port,
  });

  return { app, server };
}
