import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mcc.maker',
  appName: 'みやむMaker',
  webDir: 'out',

  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      showSpinner: false,
      backgroundColor: '#FFF8E8'
    }
  }
};

export default config;