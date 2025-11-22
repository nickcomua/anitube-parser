import { Database } from "bun:sqlite";
import type { Anime } from "./types";

const db = new Database("anitube.sqlite");

export function initDb() {
  db.run(`
    CREATE TABLE IF NOT EXISTS animes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      image_url TEXT,
      subbed_episodes INTEGER DEFAULT 0,
      dubbed_episodes INTEGER DEFAULT 0,
      player_urls TEXT,
      last_updated TEXT NOT NULL
    )
  `);
}

export function upsertAnime(anime: Anime) {
  const query = db.query(`
    INSERT INTO animes (url, title, description, image_url, subbed_episodes, dubbed_episodes, player_urls, last_updated)
    VALUES ($url, $title, $description, $imageUrl, $subbedEpisodes, $dubbedEpisodes, $playerUrls, $lastUpdated)
    ON CONFLICT(url) DO UPDATE SET
      title = excluded.title,
      description = excluded.description,
      image_url = excluded.image_url,
      subbed_episodes = excluded.subbed_episodes,
      dubbed_episodes = excluded.dubbed_episodes,
      player_urls = excluded.player_urls,
      last_updated = excluded.last_updated
  `);

  query.run({
    $url: anime.url,
    $title: anime.title,
    $description: anime.description || null,
    $imageUrl: anime.imageUrl || null,
    $subbedEpisodes: anime.subbedEpisodes,
    $dubbedEpisodes: anime.dubbedEpisodes,
    $playerUrls: JSON.stringify(anime.playerUrls),
    $lastUpdated: new Date().toISOString(),
  });
}

export function getAnimeByUrl(url: string): Anime | null {
  const query = db.query("SELECT * FROM animes WHERE url = $url");
  const result: any = query.get({ $url: url });

  if (!result) return null;

  return {
    id: result.id,
    url: result.url,
    title: result.title,
    description: result.description,
    imageUrl: result.image_url,
    subbedEpisodes: result.subbed_episodes,
    dubbedEpisodes: result.dubbed_episodes,
    playerUrls: JSON.parse(result.player_urls),
    lastUpdated: result.last_updated,
  };
}

export function getAllAnimes(): Anime[] {
  const query = db.query("SELECT * FROM animes");
  const results: any[] = query.all();

  return results.map((result) => ({
    id: result.id,
    url: result.url,
    title: result.title,
    description: result.description,
    imageUrl: result.image_url,
    subbedEpisodes: result.subbed_episodes,
    dubbedEpisodes: result.dubbed_episodes,
    playerUrls: JSON.parse(result.player_urls),
    lastUpdated: result.last_updated,
  }));
}
