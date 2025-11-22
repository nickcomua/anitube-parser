import { load } from "cheerio";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import type { Anime, PlayerUrl } from "./types";

const BASE_URL = "https://anitube.in.ua";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36";

const LOGIN_HASH_REGEX = /var\s+dle_login_hash\s*=\s*['"]([^'"]+)['"]/;
const NEWS_ID_REGEX = /var\s+dle_news_id\s*=\s*['"]?(\d+)['"]?/;
const EPISODE_NUM_REGEX = /^(\d+)/;
const EPISODE_COUNT_REGEX = /Серій:\s*(\d+)/i;

const convexUrl = process.env.CONVEX_URL;
if (!convexUrl) {
  console.error("CONVEX_URL is not defined.");
}

const client = convexUrl ? new ConvexHttpClient(convexUrl) : null;

/**
 * Fetches a URL with retry logic and rate limiting handling.
 *
 * @param url - The URL to fetch.
 * @param headers - Optional headers to include in the request.
 * @param retries - Number of retries allowed (default: 3).
 * @returns The text content of the response.
 * @throws Error if the request fails after all retries.
 */
async function fetchPage(
  url: string,
  headers: Record<string, string> = {},
  retries = 3
): Promise<string> {
  const targetUrl = url.startsWith("/") ? BASE_URL + url : url;

  try {
    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent": USER_AGENT,
        ...headers,
      },
    });

    if (response.status === 429 && retries > 0) {
      console.log(`Rate limited on ${targetUrl}. Waiting 10s...`);
      await new Promise((r) => setTimeout(r, 10_000));
      return fetchPage(targetUrl, headers, retries - 1);
    }

    if (!response.ok) {
      throw new Error(
        `Failed to fetch ${targetUrl}: ${response.status} ${response.statusText}`
      );
    }

    return await response.text();
  } catch (e) {
    if (retries > 0) {
      console.log(`Error fetching ${targetUrl}: ${e}. Retrying...`);
      await new Promise((r) => setTimeout(r, 3000));
      return fetchPage(targetUrl, headers, retries - 1);
    }
    throw e;
  }
}

function isAnimeChanged(oldAnime: Anime, newAnime: Anime): boolean {
  if (oldAnime.subbedEpisodes !== newAnime.subbedEpisodes) {
    return true;
  }
  if (oldAnime.dubbedEpisodes !== newAnime.dubbedEpisodes) {
    return true;
  }

  if (oldAnime.playerUrls?.length !== newAnime.playerUrls?.length) {
    return true;
  }

  return false;
}

/**
 * Parses anime details from a specific anime page URL.
 *
 * Extracts:
 * - Title, Description, Image
 * - Episode counts (Subbed and Dubbed)
 * - Player URLs (Video files)
 *
 * It handles the dynamic loading of playlists via AJAX by extracting
 * the user hash and news ID from the page source.
 *
 * @param url - The URL of the anime page.
 * @param title - The title of the anime (passed from the listing page).
 * @returns Parsed Anime object or null if scraping failed.
 */
async function parseAnimeDetails(
  url: string,
  title: string
): Promise<Anime | null> {
  try {
    console.log(`Scraping details for: ${title} (${url})`);
    const html = await fetchPage(url);
    const $ = load(html);

    const description = $('.story_c_text, [itemprop="description"]')
      .text()
      .trim();
    let imageUrl = $(".story_post img").attr("src");
    if (imageUrl && imageUrl.startsWith("/")) {
      imageUrl = BASE_URL + imageUrl;
    }

    const hashMatch = html.match(LOGIN_HASH_REGEX);
    const userHash = hashMatch ? hashMatch[1] : "";

    const newsId =
      $(".playlists-ajax").data("news_id") || html.match(NEWS_ID_REGEX)?.[1];

    let subbedEpisodes = 0;
    let dubbedEpisodes = 0;
    const playerUrls: PlayerUrl[] = [];

    if (userHash && newsId) {
      const ajaxUrl = `${BASE_URL}/engine/ajax/playlists.php`;
      const params = new URLSearchParams({
        news_id: newsId.toString(),
        xfield: "playlist",
        user_hash: userHash,
      });

      try {
        const res = await fetch(`${ajaxUrl}?${params.toString()}`, {
          headers: {
            "User-Agent": USER_AGENT,
            "X-Requested-With": "XMLHttpRequest",
            Referer: url,
          },
        });

        if (res.ok) {
          const data = (await res.json()) as any;
          if (data.success && data.response) {
            const $p = load(data.response);

            const uniqueSubs = new Set<string>();
            const uniqueDubs = new Set<string>();

            const videos = $p(".playlists-videos .playlists-items li");
            videos.each((_, el) => {
              const id = $p(el).attr("data-id");
              const file = $p(el).attr("data-file");
              const text = $p(el).text().trim();

              if (id) {
                const epNumMatch = text.match(EPISODE_NUM_REGEX);
                const epNum =
                  epNumMatch && epNumMatch[1] ? epNumMatch[1] : text;

                if (id.startsWith("0_0_")) {
                  uniqueDubs.add(epNum);
                } else if (id.startsWith("0_1_")) {
                  uniqueSubs.add(epNum);
                }

                if (file) {
                  playerUrls.push({ id, text, file });
                }
              }
            });

            subbedEpisodes = uniqueSubs.size;
            dubbedEpisodes = uniqueDubs.size;
          }
        }
      } catch (e) {
        console.error(`Error fetching playlist for ${url}:`, e);
      }
    }

    if (subbedEpisodes === 0 && dubbedEpisodes === 0) {
      const metaText = $(".story_c_r, .meta").text();
      const match = metaText.match(EPISODE_COUNT_REGEX);
      if (match?.[1]) {
        const count = Number.parseInt(match[1], 10);
        dubbedEpisodes = count;
      }
    }

    return {
      title,
      url,
      description,
      imageUrl,
      subbedEpisodes,
      dubbedEpisodes,
      playerUrls,
      lastUpdated: new Date().toISOString(),
    };
  } catch (e) {
    console.error(`Error scraping ${url}:`, e);
    return null;
  }
}

/**
 * Scans a single page of the anime list.
 *
 * It iterates through all anime items on the page, scrapes their details,
 * and updates the database if changes are detected.
 *
 * It implements a "stop condition" based on consecutive unchanged items.
 * This optimization prevents full site re-scans when only the latest pages matter.
 *
 * @param page - The page number to scan.
 * @param stopOptions - Options for the stop condition (limit and current count).
 * @returns Object containing processing stats and stop signal.
 */
export async function scanPage(
  page: number,
  stopOptions: { consecutiveUnchanged: number; limit: number }
): Promise<{ processed: number; consecutiveUnchanged: number; stop: boolean }> {
  if (!client) {
    throw new Error("Convex client is not initialized. Please set CONVEX_URL.");
  }
  const url = `${BASE_URL}/anime/page/${page}/`;
  console.log(`Scanning page ${page}...`);

  try {
    const html = await fetchPage(url);
    const $ = load(html);
    const items = $(".story");

    if (items.length === 0) {
      console.log("No items found on page", page);
      return {
        processed: 0,
        consecutiveUnchanged: stopOptions.consecutiveUnchanged,
        stop: true,
      };
    }

    let processed = 0;
    let currentConsecutiveUnchanged = stopOptions.consecutiveUnchanged;

    for (const el of items) {
      const linkEl = $(el).find("h2 a, .story_c a").first();
      const link = linkEl.attr("href");
      const title = linkEl.text().trim();

      if (link && title) {
        const newAnime = await parseAnimeDetails(link, title);

        if (newAnime) {
          const existingAnime = (await client.query(api.animes.getByUrl, {
            url: newAnime.url,
          })) as unknown as Anime | null;

          let hasChanged = true;
          if (existingAnime) {
            hasChanged = isAnimeChanged(existingAnime, newAnime);
          }

          if (hasChanged) {
            console.log(`Update detected for ${title}. Upserting...`);
            await client.mutation(api.animes.upsert, newAnime);
            processed += 1;
            currentConsecutiveUnchanged = 0;
          } else {
            console.log(`No changes for ${title}.`);
            currentConsecutiveUnchanged += 1;
          }

          if (currentConsecutiveUnchanged >= stopOptions.limit) {
            console.log(
              `Reached limit of ${stopOptions.limit} unchanged items. Stopping.`
            );
            return {
              processed,
              consecutiveUnchanged: currentConsecutiveUnchanged,
              stop: true,
            };
          }
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
    return {
      processed,
      consecutiveUnchanged: currentConsecutiveUnchanged,
      stop: false,
    };
  } catch (e: unknown) {
    const err = e as any;
    if (err?.message?.includes("404")) {
      console.log(`Page ${page} not found.`);
      return {
        processed: 0,
        consecutiveUnchanged: stopOptions.consecutiveUnchanged,
        stop: true,
      };
    }
    console.error(`Error scanning page ${page}:`, e);
    return {
      processed: 0,
      consecutiveUnchanged: stopOptions.consecutiveUnchanged,
      stop: false,
    };
  }
}

/**
 * Main entry point for the scraper service.
 *
 * It iterates through pages starting from page 1.
 * It stops when it encounters a configured number of consecutive unchanged items,
 * assuming that older items haven't changed.
 */
export async function runScraper() {
  let page = 1;
  let consecutiveUnchanged = 0;
  const UNCHANGED_LIMIT = 30;

  while (true) {
    const result = await scanPage(page, {
      consecutiveUnchanged,
      limit: UNCHANGED_LIMIT,
    });

    consecutiveUnchanged = result.consecutiveUnchanged;

    if (result.stop) {
      console.log("Stopping scan based on stop signal.");
      break;
    }

    if (result.processed === 0 && consecutiveUnchanged === 0) {
      break;
    }

    page += 1;
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.log("Scraping completed.");
}
