import Institution from './Institution';

export type PlaidMetaData = {
  institution: unknown,
}

type PlaidCallback = (token: string, metaData: PlaidMetaData) => Promise<Institution | null>;

class Plaid {
  callback: undefined | PlaidCallback;

  linkToken: string;

  constructor(linkToken: string, callback?: PlaidCallback) {
    this.callback = callback;
    this.linkToken = linkToken;
  }
}

export default Plaid;
