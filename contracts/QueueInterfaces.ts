export interface PlaidWebHookProps {
  itemId: string,
}

export enum QueueNamesEnum {
  'PlaidItemCleanup' = 'PlaidItemCleanup',
  'PlaidWebHook' = 'PlaidWebHook'
}
