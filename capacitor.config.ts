import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.kilssengkyu.brainrush',
  appName: 'BrainRush',
  webDir: 'dist',
  plugins: {
    StatusBar: {
      overlaysWebView: true
    }
  }
};

export default config;
