import { ConvexHttpClient } from "convex/browser";
import { InlineKeyboard } from "grammy";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { bot } from "./telegram";

const convexUrl = process.env.CONVEX_URL;
if (!convexUrl) {
  console.error("CONVEX_URL is not defined.");
  // We don't exit here to allow other parts of the app to run if needed,
  // but bot won't work without convex
}

const client = convexUrl ? new ConvexHttpClient(convexUrl) : null;

// Store pending subscriptions: chatId -> { url, title }
const pendingSubscriptions = new Map<number, { url: string; title: string }>();

// Moved regex to top level to avoid recompilation
const SUB_DUB_REGEX = /^(sub|dub|all)$/;
const TITLE_EXTRACT_REGEX = /\/(\d+)-(.*?)\.html/;

type NotificationQueueId = Id<"notificationQueue">;

type NotificationQueue = {
  _id: NotificationQueueId;
  animeUrl: string;
  title: string;
  type: string;
};

type Subscription = {
  telegramChatId: number;
  type: string;
  title: string;
  animeUrl: string;
};

/**
 * Generates the notification message content based on subscription preferences.
 *
 * @param subType - The user's subscription type ('sub', 'dub', 'all').
 * @param notificationType - The type of the new episode ('sub', 'dub', 'all').
 * @param title - The title of the anime.
 * @param animeUrl - The URL of the anime.
 * @returns The formatted message string or null if no notification should be sent.
 */
function getNotificationMessage(
  subType: string,
  notificationType: string,
  title: string,
  animeUrl: string
): string | null {
  let msg = "";
  let shouldNotify = false;

  if (subType === "all") {
    shouldNotify = true;
    if (notificationType === "all") {
      msg = `New Sub & Dub episodes for ${title}!`;
    } else if (notificationType === "sub") {
      msg = `New Sub episode for ${title}!`;
    } else {
      msg = `New Dub episode for ${title}!`;
    }
  } else if (
    subType === "sub" &&
    (notificationType === "sub" || notificationType === "all")
  ) {
    shouldNotify = true;
    msg = `New Sub episode for ${title}!`;
  } else if (
    subType === "dub" &&
    (notificationType === "dub" || notificationType === "all")
  ) {
    shouldNotify = true;
    msg = `New Dub episode for ${title}!`;
  }

  if (shouldNotify) {
    return `${msg}\n${animeUrl}`;
  }
  return null;
}

/**
 * Processes pending notifications from the queue.
 *
 * 1. Fetches pending notifications from Convex.
 * 2. For each notification, finds relevant subscribers.
 * 3. Sends Telegram messages to those subscribers.
 * 4. Marks the notification as processed in Convex.
 */
async function processNotifications() {
  if (!(client && bot)) {
    return;
  }

  try {
    const pendingNotifications = (await client.query(
      api.animes.getPendingNotifications,
      {}
    )) as NotificationQueue[];

    for (const notification of pendingNotifications) {
      const subscribers = (await client.query(
        api.subscriptions.getSubscribersByUrl,
        { animeUrl: notification.animeUrl }
      )) as Subscription[];

      for (const sub of subscribers) {
        const message = getNotificationMessage(
          sub.type,
          notification.type,
          notification.title,
          notification.animeUrl
        );

        if (message) {
          try {
            await bot.api.sendMessage(sub.telegramChatId, message);
          } catch (e) {
            console.error(
              `Failed to send notification to ${sub.telegramChatId}:`,
              e
            );
          }
        }
      }

      await client.mutation(api.animes.markNotificationProcessed, {
        id: notification._id,
      });
    }
  } catch (e) {
    console.error("Error processing notifications:", e);
  }
}

/**
 * Initializes and starts the Telegram bot.
 *
 * Sets up command handlers:
 * - /start: Welcome message.
 * - /subscribe <url>: Subscribe to an anime.
 * - /unsubscribe <url>: Unsubscribe from an anime.
 * - /list: List current subscriptions.
 *
 * Also starts the polling interval for processing notifications.
 */
export async function runBot() {
  if (!bot) {
    console.error("Bot not initialized. Check TELEGRAM_BOT_TOKEN.");
    return;
  }
  if (!client) {
    console.error("Convex client not initialized. Check CONVEX_URL.");
    return;
  }

  bot.command("start", (ctx) =>
    ctx.reply(
      "Welcome! Use /subscribe <url> to get notifications for an anime.\nUse /list to see your subscriptions."
    )
  );

  bot.command("subscribe", async (ctx) => {
    const url = ctx.match;
    if (!url) {
      return ctx.reply(
        "Please provide an Anitube URL. Example: /subscribe https://anitube.in.ua/..."
      );
    }

    if (!url.includes("anitube.in.ua")) {
      return ctx.reply("Invalid URL. Must be from anitube.in.ua.");
    }

    // Try to get title from DB or derive from URL
    const anime = await client.query(api.animes.getByUrl, { url });
    let title = anime?.title;

    if (!title) {
      // Simple title extraction from URL if not in DB
      // https://anitube.in.ua/3960-one-piece.html -> one-piece
      const match = url.match(TITLE_EXTRACT_REGEX);
      title = match?.[2] ? match[2].replace(/-/g, " ") : url;
    }

    if (ctx.chat?.id) {
      pendingSubscriptions.set(ctx.chat.id, { url, title });

      const keyboard = new InlineKeyboard()
        .text("Sub Only", "sub")
        .text("Dub Only", "dub")
        .text("Both", "all");

      await ctx.reply(`Choose notification type for: ${title}`, {
        reply_markup: keyboard,
      });
    }
  });

  bot.callbackQuery(SUB_DUB_REGEX, async (ctx) => {
    if (!ctx.match) {
      return;
    }
    const type = ctx.match[0];
    const chatId = ctx.chat?.id;
    if (!chatId) {
      return;
    }

    const pending = pendingSubscriptions.get(chatId);
    if (!pending) {
      return ctx.answerCallbackQuery({
        text: "Session expired. Please try /subscribe again.",
      });
    }

    if (client) {
      await client.mutation(api.subscriptions.subscribe, {
        telegramChatId: chatId,
        animeUrl: pending.url,
        type,
        title: pending.title,
      });
    }

    pendingSubscriptions.delete(chatId);

    await ctx.answerCallbackQuery({ text: `Subscribed to ${type} updates!` });
    await ctx.editMessageText(`Subscribed to ${pending.title} (${type})`);
  });

  bot.command("unsubscribe", async (ctx) => {
    const url = ctx.match;
    if (!url) {
      return ctx.reply("Please provide an Anitube URL to unsubscribe from.");
    }

    const chatId = ctx.chat.id;
    if (client) {
      await client.mutation(api.subscriptions.unsubscribe, {
        telegramChatId: chatId,
        animeUrl: url,
      });
    }

    ctx.reply("Unsubscribed successfully.");
  });

  bot.command("list", async (ctx) => {
    const chatId = ctx.chat.id;
    if (!client) {
      return;
    }

    const subs = (await client.query(api.subscriptions.getSubscriptions, {
      telegramChatId: chatId,
    })) as Subscription[];

    if (subs.length === 0) {
      return ctx.reply("You have no subscriptions.");
    }

    const message = subs
      .map((s: Subscription) => `- [${s.title}](${s.animeUrl}) (${s.type})`)
      .join("\n");

    ctx.reply(message, {
      parse_mode: "Markdown",
      link_preview_options: { is_disabled: true },
    });
  });

  // Handle errors
  bot.catch((err) => {
    console.error("Bot error:", err);
  });

  // Start notification poller
  setInterval(processNotifications, 10_000); // Check every 10 seconds

  console.log("Starting bot...");
  await bot.start();
}
