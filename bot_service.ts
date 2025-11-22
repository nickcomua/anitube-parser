import { runBot } from "./src/bot";

console.log("Starting Anitube Telegram Bot...");
runBot().catch((err) => {
  console.error("Fatal error in bot:", err);
  process.exit(1);
});
