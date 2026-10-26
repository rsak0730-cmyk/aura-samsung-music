import { openDB, DBSchema } from 'idb';
import { TrackItem, Playlist, StorageBreakdown } from '../types';

export interface PersistentTrackRecord extends TrackItem {
  rawAudioBlob?: Blob;
}

interface AuraRoomDB extends DBSchema {
  tracks: {
    key: string;
    value: PersistentTrackRecord;
    indexes: {
      'by-artist': string;
      'by-album': string;
      'by-genre': string;
      'by-date': number;
    };
  };
  playlists: { key: string; value: Playlist };
}

export class AuraRoomStore {
  private dbPromise = openDB<AuraRoomDB>('AuraSamsungMusicRoomDB', 2, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('tracks')) {
        const trackStore = db.createObjectStore('tracks', { keyPath: 'id' });
        trackStore.createIndex('by-artist', 'artist');
        trackStore.createIndex('by-album', 'album');
        trackStore.createIndex('by-genre', 'genre');
        trackStore.createIndex('by-date', 'dateAdded');
      }
      if (!db.objectStoreNames.contains('playlists')) {
        db.createObjectStore('playlists', { keyPath: 'id' });
      }
    },
  });

  public async getAllTracks(): Promise<TrackItem[]> {
    const db = await this.dbPromise;
    const records = await db.getAll('tracks');
    return records.map((record) => {
      if (record.rawAudioBlob) {
        record.blobUrl = URL.createObjectURL(record.rawAudioBlob);
      }
      return record;
    });
  }

  public async saveTrack(track: PersistentTrackRecord): Promise<void> {
    const db = await this.dbPromise;
    await db.put('tracks', track);
  }

  public async deleteTrack(id: string): Promise<void> {
    const db = await this.dbPromise;
    await db.delete('tracks', id);
  }

  public async getPlaylists(): Promise<Playlist[]> {
    const db = await this.dbPromise;
    return db.getAll('playlists');
  }

  public async savePlaylist(playlist: Playlist): Promise<void> {
    const db = await this.dbPromise;
    await db.put('playlists', playlist);
  }

  public async getStorageSummary(): Promise<StorageBreakdown> {
    const tracks = await this.getAllTracks();
    let totalBytes = 0;
    const formatCounts: Record<string, number> = {};

    tracks.forEach((t) => {
      totalBytes += t.fileSize;
      formatCounts[t.format] = (formatCounts[t.format] || 0) + 1;
    });

    return {
      totalBytes,
      formatCounts,
      artworkBytesEstimated: tracks.length * 150000,
    };
  }

  public async parseAndStoreFile(file: File, folderPath = '/Storage'): Promise<TrackItem> {
    const cleanName = file.name.replace(/\.[^/.]+$/, '');
    const parts = cleanName.split('-');

    const track: PersistentTrackRecord = {
      id: `trk_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      title: parts.length > 1 ? parts[1].trim() : cleanName,
      artist: parts.length > 1 ? parts[0].trim() : 'Unknown Artist',
      album: folderPath.replace(/^\//, '') || 'Local Music',
      genre: 'General',
      composer: 'Various',
      duration: 210,
      fileSize: file.size,
      format: file.name.split('.').pop()?.toUpperCase() || 'MP3',
      path: `${folderPath}/${file.name}`,
      dateAdded: Date.now(),
      playCount: 0,
      isFavorite: false,
      artwork: `https://picsum.photos/seed/${encodeURIComponent(cleanName)}/400/400`,
      rawAudioBlob: file,
      blobUrl: URL.createObjectURL(file),
    };

    await this.saveTrack(track);
    return track;
  }

  public async scanDirectory(dirHandle: FileSystemDirectoryHandle, path = ''): Promise<TrackItem[]> {
    const tracks: TrackItem[] = [];
    for await (const entry of (dirHandle as any).values()) {
      const itemPath = `${path}/${entry.name}`;
      if (entry.kind === 'directory') {
        const nested = await this.scanDirectory(entry, itemPath);
        tracks.push(...nested);
      } else if (entry.kind === 'file') {
        const file: File = await entry.getFile();
        if (/\.(mp3|wav|ogg|flac|m4a|aac|opus)$/i.test(file.name)) {
          const track = await this.parseAndStoreFile(file, path);
          tracks.push(track);
        }
      }
    }
    return tracks;
  }
}

export const auraRoom = new AuraRoomStore();