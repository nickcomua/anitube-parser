import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * Retrieves an anime by its URL.
 * Used by the scraper to check for existing records and by the bot to validate subscriptions.
 */
export const getByUrl = query({
  args: { url: v.string() },
  handler: async (ctx, args) =>
    await ctx.db
      .query("animes")
      .withIndex("by_url", (q) => q.eq("url", args.url))
      .unique(),
});

/**
 * Updates or inserts an anime record.
 *
 * If the anime already exists, it checks if the episode counts have increased.
 * If there are new episodes, it adds an entry to the 'notificationQueue' table.
 */
export const upsert = mutation({
  args: {
    url: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    subbedEpisodes: v.number(),
    dubbedEpisodes: v.number(),
    playerUrls: v.array(
      v.object({
        id: v.string(),
        text: v.string(),
        file: v.string(),
      })
    ),
    lastUpdated: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("animes")
      .withIndex("by_url", (q) => q.eq("url", args.url))
      .unique();

    let subChanged = false;
    let dubChanged = false;

    if (existing) {
      subChanged = args.subbedEpisodes > existing.subbedEpisodes;
      dubChanged = args.dubbedEpisodes > existing.dubbedEpisodes;
      await ctx.db.patch(existing._id, args);
    } else {
      await ctx.db.insert("animes", args);
      // New anime is effectively a change if we want to notify, but typically users subscribe first.
      // If we want to notify on NEW anime, we'd flag both.
      // For now, assume we only notify if someone is subscribed, and since it's new, no one is subscribed yet?
      // Actually, users subscribe to URL. If they subscribed before it existed (not possible with current bot logic which validates URL),
      // but wait, current bot logic checks DB.
      // So we only care about updates to existing ones.
    }

    if (subChanged || dubChanged) {
      let type = "sub";
      if (subChanged && dubChanged) {
        type = "all";
      } else if (dubChanged) {
        type = "dub";
      }

      await ctx.db.insert("notificationQueue", {
        animeUrl: args.url,
        title: args.title,
        type,
        status: "pending",
        createdAt: Date.now(),
      });
    }
  },
});

/**
 * Retrieves all stored anime records.
 */
export const getAll = query({
  args: {},
  handler: async (ctx) => await ctx.db.query("animes").collect(),
});

/**
 * Internal query for the bot to fetch pending notifications.
 * Only returns notifications with status 'pending'.
 */
export const getPendingNotifications = query({
  args: {},
  handler: async (ctx) =>
    await ctx.db
      .query("notificationQueue")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect(),
});

/**
 * Marks a notification as processed.
 * Called by the bot after successfully sending notifications to subscribers.
 */
export const markNotificationProcessed = mutation({
  args: { id: v.id("notificationQueue") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { status: "processed" });
  },
});
