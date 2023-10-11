import { PlaidLinkOnSuccessMetadata } from 'react-plaid-link';
import { InstitutionInterface } from './State';

type PlaidCallback = (token: string, metaData: PlaidLinkOnSuccessMetadata) => Promise<InstitutionInterface | null>;

class Plaid {
  callback: undefined | PlaidCallback;

  linkToken: string;

  constructor(linkToken: string, callback?: PlaidCallback) {
    this.callback = callback;
    this.linkToken = linkToken;
  }
}

export default Plaid;
