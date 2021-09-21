import { InstitutionInterface } from './State';

export type PlaidMetaData = {
  institution: {
    name: string,
    // eslint-disable-next-line camelcase
    institution_id: string,
  },
}

type PlaidCallback = (token: string, metaData: PlaidMetaData) => Promise<InstitutionInterface | null>;

class Plaid {
  callback: undefined | PlaidCallback;

  linkToken: string;

  constructor(linkToken: string, callback?: PlaidCallback) {
    this.callback = callback;
    this.linkToken = linkToken;
  }
}

export default Plaid;
