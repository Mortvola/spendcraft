import { PlaidInterface, InstitutionInterface } from './Types';

class Plaid implements PlaidInterface {
  institution: InstitutionInterface | null = null;

  linkToken: string;

  constructor(linkToken: string, institution?: InstitutionInterface) {
    this.institution = institution ?? null;
    this.linkToken = linkToken;
  }
}

export default Plaid;
