import { runScraper } from "./src/scraper";

console.log("Starting Anitube Scraper Service...");
runScraper().catch((err) => {
  console.error("Fatal error in scraper:", err);
  process.exit(1);
});
