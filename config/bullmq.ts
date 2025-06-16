import { ConnectionOptions as BullMQConfig } from 'bullmq'
import env from '#start/env'
export default {
  host: env.get('BULLMQ_REDIS_HOST', '127.0.0.1') as string,
  port: env.get('BULLMQ_REDIS_PORT', 6379) as number,
  password: env.get('BULLMQ_REDIS_PASSWORD', '') as string,
  db: 0,
  keyPrefix: '',
} as BullMQConfig
