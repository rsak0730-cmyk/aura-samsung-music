import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.samsung.music.aura',
  appName: 'Samsung Music Aura',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;