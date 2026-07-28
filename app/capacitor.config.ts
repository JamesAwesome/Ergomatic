import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'haus.waffle.ergomatic',
  appName: 'Ergomatic',
  webDir: 'dist/client',
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
  },
}

export default config
