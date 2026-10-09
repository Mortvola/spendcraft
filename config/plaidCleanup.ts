import env from '#start/env'

// JSON map of immutable version IDs to dedicated secrets. Keep old versions until
// every outstanding recovery credential has been resolved or re-encrypted.
export default {
  activeKey: env.get('PLAID_CLEANUP_KEY_VERSION', ''),
  keys: env.get('PLAID_CLEANUP_KEYS', '{}'),
}
