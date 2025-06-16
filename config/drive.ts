import { driveConfig } from '@adonisjs/core/build/config'
import env from '#start/env'

export default driveConfig({
  disk: env.get('DRIVE_DISK'),

  disks: {
    local: {
      driver: 'local',
      visibility: 'public',
      root: './',
    },
  },
})
