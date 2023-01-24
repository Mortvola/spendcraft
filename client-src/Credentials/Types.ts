export type RecoverPasswordState = 'Enter Email' | 'Verify Code' | 'Change Password';

export type Context = {
  state: RecoverPasswordState,
  email: string,
};
