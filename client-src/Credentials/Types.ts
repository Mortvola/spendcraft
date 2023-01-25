export type State = 'Enter Email' | 'Verify Code' | 'Change Password' | 'Enter Info';

export type Context = {
  state: State,
  email: string,
};
