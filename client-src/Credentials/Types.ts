export type State = 'Enter Email' | 'Verify Code' | 'Change Password' | 'Enter Info';

export interface Context {
  state: State,
  email: string,
}
