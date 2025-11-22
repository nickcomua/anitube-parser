export interface PlayerUrl {
  id: string;
  text: string;
  file: string;
}

export interface Anime {
  id?: number;
  title: string;
  url: string;
  description?: string;
  imageUrl?: string;
  subbedEpisodes: number;
  dubbedEpisodes: number;
  playerUrls: PlayerUrl[];
  lastUpdated: string;
}
