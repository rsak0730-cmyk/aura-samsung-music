import { TrackItem } from '../types';

export type MoodCategory = 'Chill' | 'Workout' | 'Focus' | 'Party' | 'LateNight';

interface AudioFeatures {
  energy: number;
  valence: number;
  danceability: number;
  acousticness: number;
  brightness: number;
}

export class AuraInbuiltAudioAI {
  private readonly W1: number[][] = [
    [-0.52,  0.89, -0.31,  0.74, -0.65],
    [ 0.78,  0.12,  0.65, -0.45,  0.32],
    [-0.64, -0.71, -0.82,  0.91, -0.21],
    [ 0.85,  0.64,  0.92, -0.68,  0.77],
    [-0.81, -0.55, -0.42,  0.62, -0.73],
    [ 0.42,  0.38,  0.51, -0.22,  0.41],
    [-0.33,  0.15, -0.19,  0.81, -0.45],
    [ 0.91,  0.75,  0.88, -0.79,  0.82]
  ];

  private readonly B1: number[] = [0.1, -0.2, 0.3, -0.1, 0.4, 0.0, 0.2, -0.3];

  private readonly W2: number[][] = [
    [ 0.95, -0.82,  0.41, -0.88,  0.65],
    [-0.78,  1.12, -0.65,  0.92, -0.72],
    [ 0.62, -0.74,  1.05, -0.81,  0.22],
    [-0.85,  0.98, -0.52,  1.15, -0.64],
    [ 0.51, -0.91, -0.22, -0.75,  1.10]
  ];

  private readonly B2: number[] = [0.15, -0.1, 0.2, -0.15, 0.05];

  private readonly genreVectors: Record<string, AudioFeatures> = {
    electronic: { energy: 0.85, valence: 0.65, danceability: 0.90, acousticness: 0.10, brightness: 0.85 },
    ambient:    { energy: 0.20, valence: 0.45, danceability: 0.25, acousticness: 0.85, brightness: 0.35 },
    classical:  { energy: 0.35, valence: 0.50, danceability: 0.20, acousticness: 0.95, brightness: 0.55 },
    rock:       { energy: 0.88, valence: 0.60, danceability: 0.60, acousticness: 0.25, brightness: 0.75 },
    pop:        { energy: 0.75, valence: 0.80, danceability: 0.85, acousticness: 0.30, brightness: 0.78 },
    lofi:       { energy: 0.30, valence: 0.40, danceability: 0.50, acousticness: 0.75, brightness: 0.30 },
    audiobook:  { energy: 0.15, valence: 0.50, danceability: 0.10, acousticness: 0.90, brightness: 0.40 },
  };

  public extractFeatures(track: TrackItem): AudioFeatures {
    const text = `${track.genre} ${track.title} ${track.album}`.toLowerCase();
    for (const [key, vector] of Object.entries(this.genreVectors)) {
      if (text.includes(key)) return vector;
    }
    return { energy: 0.5, valence: 0.5, danceability: 0.5, acousticness: 0.5, brightness: 0.5 };
  }

  public predictMood(features: AudioFeatures): MoodCategory {
    const input = [features.energy, features.valence, features.danceability, features.acousticness, features.brightness];
    const hidden: number[] = new Array(8).fill(0);
    for (let i = 0; i < 8; i++) {
      let sum = this.B1[i];
      for (let j = 0; j < 5; j++) sum += this.W1[i][j] * input[j];
      hidden[i] = Math.max(0, sum);
    }

    const scores: number[] = new Array(5).fill(0);
    for (let i = 0; i < 5; i++) {
      let sum = this.B2[i];
      for (let j = 0; j < 8; j++) sum += this.W2[i][j] * hidden[j];
      scores[i] = sum;
    }

    const expScores = scores.map(Math.exp);
    const sumExp = expScores.reduce((a, b) => a + b, 0);
    const probabilities = expScores.map((s) => s / sumExp);

    const categories: MoodCategory[] = ['Chill', 'Workout', 'Focus', 'Party', 'LateNight'];
    let bestIdx = 0;
    let maxProb = probabilities[0];
    for (let i = 1; i < probabilities.length; i++) {
      if (probabilities[i] > maxProb) {
        maxProb = probabilities[i];
        bestIdx = i;
      }
    }
    return categories[bestIdx];
  }

  public categorizeLibrary(tracks: TrackItem[]): Record<MoodCategory, TrackItem[]> {
    const moodBuckets: Record<MoodCategory, TrackItem[]> = {
      Chill: [],
      Workout: [],
      Focus: [],
      Party: [],
      LateNight: [],
    };

    for (const track of tracks) {
      const features = this.extractFeatures(track);
      const mood = this.predictMood(features);
      moodBuckets[mood].push(track);
    }
    return moodBuckets;
  }
}

export const inbuiltAudioAI = new AuraInbuiltAudioAI();