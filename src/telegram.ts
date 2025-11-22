import { Bot } from "grammy";

if (!process.env.TELEGRAM_BOT_TOKEN) {
  console.warn(
    "TELEGRAM_BOT_TOKEN is not defined. Bot features will not work."
  );
}

export const bot = process.env.TELEGRAM_BOT_TOKEN
  ? new Bot(process.env.TELEGRAM_BOT_TOKEN)
  : null;
