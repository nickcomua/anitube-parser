import { Database } from "bun:sqlite";
import { scanPage } from "./src/scraper";

const db = new Database("anitube.sqlite");

async function check() {
  console.log("Running manual scan of page 1...");
  await scanPage(1, { consecutiveUnchanged: 0, limit: 30 });

  const count = db.query("SELECT COUNT(*) as count FROM animes").get() as any;
  console.log(`Total Anime in DB: ${count.count}`);

  const sample = db
    .query("SELECT * FROM animes ORDER BY last_updated DESC LIMIT 1")
    .get() as any;
  if (sample) {
    console.log("Latest Anime:");
    console.log(`Title: ${sample.title}`);
    console.log(
      `Subs: ${sample.subbed_episodes}, Dubs: ${sample.dubbed_episodes}`
    );
    try {
      const urls = JSON.parse(sample.player_urls);
      console.log(`Player URLs (count): ${urls.length}`);
    } catch (e) {
      console.log("Error parsing player_urls JSON");
    }
  }
}

check();
