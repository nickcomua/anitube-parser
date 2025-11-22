# Anitube Parser (Scraper + Telegram Bot)

This project is a comprehensive solution for scraping anime updates from [Anitube.in.ua](https://anitube.in.ua) and notifying users via a Telegram bot. It uses [Convex](https://convex.dev) as a realtime backend and database.

## Architecture

The system is composed of three main parts:

1.  **Convex Backend**: Hosting the database (schema, queries, mutations) and handling data persistence.
2.  **Scraper Service**: A Node.js/Bun service that periodically scrapes the Anitube website for new episodes (subbed and dubbed) and updates the Convex database.
3.  **Telegram Bot Service**: A Node.js/Bun service that interfaces with the Telegram API to manage user subscriptions and send notifications about new episodes.

## Prerequisites

-   [Bun](https://bun.sh) (v1.3.1 or later) or Node.js
-   A [Convex](https://convex.dev) account and project
-   A Telegram Bot Token (from [@BotFather](https://t.me/BotFather))

## Setup

1.  **Install dependencies:**

    ```bash
    bun install
    ```

2.  **Environment Variables:**

    Create a `.env.local` file (if running locally) or set these in your environment:

    ```env
    # Convex URL (get this from your Convex dashboard)
    CONVEX_URL=https://your-deployment-name.convex.cloud

    # Telegram Bot Token
    TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
    ```

    *Note: The `.env.local` file is git-ignored for security.*

3.  **Initialize Convex:**

    ```bash
    bun convex dev
    ```

## Running the Services

You can run the services independently.

### 1. Run the Scraper

This service scrapes the website and populates the database.

```bash
bun run scraper_service.ts
```

### 2. Run the Telegram Bot

This service handles user interactions and sends notifications.

```bash
bun run bot_service.ts
```

### 3. Run Both (via index)

The `src/index.ts` file is set up to run the scraper periodically.

```bash
bun run src/index.ts
```

## Features

-   **Automated Scraping**: Checks for new episodes and updates.
-   **Smart Notifications**: Users can subscribe to specific anime.
-   **Subscription Types**: Choose between "Sub Only", "Dub Only", or "Both".
-   **Real-time Updates**: Leveraging Convex for efficient data handling.

## Development

-   **Database Schema**: Defined in `convex/schema.ts`.
-   **Scraper Logic**: Located in `src/scraper.ts`.
-   **Bot Logic**: Located in `src/bot.ts`.
