import { driveConfig } from '@adonisjs/core/build/config'
import Env from '@ioc:Adonis/Core/Env'

export default driveConfig({
  disk: Env.get('DRIVE_DISK'),

  disks: {
    local: {
      driver: 'local',
      visibility: 'public',
      root: './',
    },
  },
})
