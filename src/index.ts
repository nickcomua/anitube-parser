import { runScraper } from "./scraper";

console.log("Starting AniTube Parser Service...");

// Run scraper immediately
runScraper().catch(console.error);

// Schedule periodic runs (every 1 hour)
setInterval(
  () => {
    console.log("Starting periodic scan...");
    runScraper().catch(console.error);
  },
  60 * 60 * 1000
);
