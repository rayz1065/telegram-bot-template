import { Bot, session } from 'grammy';
import { hydrateReply, parseMode } from '@grammyjs/parse-mode';
import { conversations } from '@grammyjs/conversations';
import { authenticate } from './middlewares/authenticate.js';
import { PrismaAdapter } from '@grammyjs/storage-prisma';
import { prisma } from './prisma.js';
import { i18n } from './i18n.js';
import { storeTelegramChat } from './middlewares/store-telegram-chat.js';
import { createContextConstructor, MyContext } from './context.js';
import { editOrReplyMiddleware } from 'grammy-edit-or-reply';
import { TgError, defaultTgErrorHandler } from './lib/tg-error.js';
import { tgComponentsMiddleware } from 'grammy-tg-components';
import { mainMenuModule } from './modules/main-menu.js';
import { appConfig } from './config.js';
import { logger } from './logger.js';
import { autoAnswerCallbacks } from './lib/auto-answer-callbacks.js';
import { ignoreNotModified } from './lib/ignore-not-modified.js';
import { settingsModule } from './modules/settings.js';
import { fallbackModule } from './modules/fallback.js';

export function buildBot() {
  const bot = new Bot<MyContext>(appConfig.BOT_TOKEN, {
    ContextConstructor: createContextConstructor({
      config: appConfig,
      logger,
    }),
  });
  bot.api.config.use(parseMode('HTML'));
  bot.api.config.use(ignoreNotModified());

  const protectedBot = bot.errorBoundary((error) => {
    error.ctx.logger.error(
      {
        error: error.error,
        update: error.ctx.update,
        stack: error.stack,
      },
      'Error boundary caught error'
    );
  });

  protectedBot.use(
    session({
      initial: () => ({}),
      storage: new PrismaAdapter(prisma.session),
    })
  );

  protectedBot.use(hydrateReply);
  protectedBot.use(i18n);
  protectedBot.use(storeTelegramChat);
  protectedBot.use(authenticate);
  protectedBot.use(conversations());
  protectedBot.use(
    tgComponentsMiddleware({
      eventRejectionHandler: async (ctx, error) => {
        const tgError = new TgError(error.message, error.variables);
        await defaultTgErrorHandler(ctx, tgError);
      },
    })
  );
  protectedBot.use(editOrReplyMiddleware());
  protectedBot.use(autoAnswerCallbacks());

  // modules
  protectedBot.use(mainMenuModule);
  protectedBot.use(settingsModule);
  protectedBot.use(fallbackModule);

  // unexpected unhandled callback data
  protectedBot.on('callback_query:data', async (ctx, next) => {
    ctx.logger.warn({ data: ctx.callbackQuery.data }, 'No match for data');
    await next();
  });

  return bot;
}
