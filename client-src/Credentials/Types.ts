type State = 'Enter Email' | 'Verify Code' | 'Add Accounts' | 'Change Password' | 'Enter Info';

export interface Context {
  state: State,
  email: string,
}
