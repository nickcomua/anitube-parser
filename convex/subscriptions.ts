import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * Subscribes a user (Telegram chat) to an anime.
 *
 * If a subscription already exists for this chat and anime, it updates the type and title.
 * Otherwise, it creates a new subscription.
 *
 * @param telegramChatId - The Telegram chat ID.
 * @param animeUrl - The URL of the anime.
 * @param type - The type of subscription ("sub", "dub", or "all").
 * @param title - The title of the anime (cached for display).
 */
export const subscribe = mutation({
  args: {
    telegramChatId: v.number(),
    animeUrl: v.string(),
    type: v.string(),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("subscriptions")
      .withIndex("by_chat_and_url", (q) =>
        q
          .eq("telegramChatId", args.telegramChatId)
          .eq("animeUrl", args.animeUrl)
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { type: args.type, title: args.title });
    } else {
      await ctx.db.insert("subscriptions", args);
    }
  },
});

/**
 * Unsubscribes a user from an anime.
 *
 * @param telegramChatId - The Telegram chat ID.
 * @param animeUrl - The URL of the anime to unsubscribe from.
 */
export const unsubscribe = mutation({
  args: {
    telegramChatId: v.number(),
    animeUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("subscriptions")
      .withIndex("by_chat_and_url", (q) =>
        q
          .eq("telegramChatId", args.telegramChatId)
          .eq("animeUrl", args.animeUrl)
      )
      .unique();

    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});

/**
 * Retrieves all subscriptions for a given Telegram chat.
 * Used by the bot's /list command.
 */
export const getSubscriptions = query({
  args: { telegramChatId: v.number() },
  handler: async (ctx, args) =>
    await ctx.db
      .query("subscriptions")
      .withIndex("by_chat", (q) => q.eq("telegramChatId", args.telegramChatId))
      .collect(),
});

/**
 * Retrieves all subscribers for a specific anime URL.
 * Used by the bot to determine who to notify when an update occurs.
 */
export const getSubscribersByUrl = query({
  args: { animeUrl: v.string() },
  handler: async (ctx, args) =>
    await ctx.db
      .query("subscriptions")
      .withIndex("by_url", (q) => q.eq("animeUrl", args.animeUrl))
      .collect(),
});
