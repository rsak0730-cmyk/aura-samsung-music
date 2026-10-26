export interface TrackItem {
  id: string;
  title: string;
  artist: string;
  album: string;
  genre: string;
  composer: string;
  duration: number;
  fileSize: number;
  format: string;
  path: string;
  dateAdded: number;
  playCount: number;
  isFavorite: boolean;
  artwork: string;
  blobUrl?: string;
  audioBookBookmark?: number;
}

export interface Playlist {
  id: string;
  name: string;
  trackIds: string[];
  createdAt: number;
}

export interface StorageBreakdown {
  totalBytes: number;
  formatCounts: Record<string, number>;
  artworkBytesEstimated: number;
}