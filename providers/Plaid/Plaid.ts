import PlaidException from './PlaidException';
import Plaid, {
  Institution, PlaidError,
  Transaction,
  PlaidApi,
  PlaidEnvironments,
  Configuration,
  CountryCode,
  Products,
} from 'plaid';

export {
  CountryCode, Products,
  Institution as PlaidInstitution,
  PlaidError, Transaction as PlaidTransaction,
};

export type PlaidConfig = {
  clientId: string,
  sandboxSecret: string,
  developmentSecret: string,
  productionSecret: string,
  environment: string,
}

class PlaidWrapper {
  plaid: PlaidApi;

  clientId: string;
  
  secret: string;

  constructor (config: PlaidConfig) {
    let secret = '';
    const env = config.environment;
    if (env === 'sandbox') {
      secret = config.sandboxSecret;
    }
    else if (env === 'development') {
      secret = config.developmentSecret;
    }
    else if (env === 'production') {
      secret = config.productionSecret;
    }

    this.secret = secret;
    this.clientId = config.clientId;

    const clientConfig: Configuration = new Configuration({
      basePath: PlaidEnvironments[env],
      baseOptions: {
        'PLAID-CLIENT-ID': config.clientId,
        'PLAID-SECRET': secret,
      },
      // options: {
      //   version: '2020-09-14',
      // },
    });

    try {
      this.plaid = new PlaidApi(clientConfig);
    }
    catch (error) {
      throw new PlaidException(error);
    }
  }

  async getItem(accessToken: string): Promise<Plaid.ItemGetResponse> {
    try {
      const response = await this.plaid.itemGet({
        client_id: this.clientId,
        secret: this.secret,
        access_token: accessToken,
      });

      return response.data;
    }
    catch (error) {
      // console.log(JSON.stringify(error.response.data));
      throw new PlaidException(error);
    }
  }

  async removeItem(accessToken: string): Promise<Plaid.ItemRemoveResponse> {
    try {
      const response = await this.plaid.itemRemove({
        client_id: this.clientId,
        secret: this.secret,
        access_token: accessToken,
      });

      return response.data;
    }
    catch (error) {
      throw new PlaidException(error);
    }
  }

  async getAccounts(accessToken: string, options?: Plaid.AccountsGetRequestOptions): Promise<Plaid.AccountsGetResponse> {
    try {
      const response = await this.plaid.accountsGet(
        {
          client_id: this.clientId,
          secret: this.secret,
          access_token: accessToken,
        },
        options,
      );

      return response.data;
    }
    catch (error) {
      // console.log(JSON.stringify(error.response.data));
      throw new PlaidException(error);
    }
  }

  async exchangePublicToken(publicToken: string): Promise<Plaid.ItemPublicTokenExchangeResponse> {
    try {
      const response = await this.plaid.itemPublicTokenExchange({ public_token: publicToken });

      return response.data;
    }
    catch (error) {
      throw new PlaidException(error);
    }
  }

  async createLinkToken(options: Plaid.LinkTokenCreateRequest): Promise<Plaid.LinkTokenCreateResponse> {
    try {
      const response = await this.plaid.linkTokenCreate(options);

      return response.data;
    }
    catch (error) {
      throw new PlaidException(error);
    }
  }

  async getWebhookVerificationKey(keyId: string): Promise<Plaid.WebhookVerificationKeyGetResponse> {
    try {
      const response = await this.plaid.webhookVerificationKeyGet({ key_id: keyId });

      return response.data;
    }
    catch (error) {
      throw new PlaidException(error);
    }
  }

  async getBalance(accessToken: string, options?: Plaid.AccountsBalanceGetRequestOptions): Promise<Plaid.AccountsGetResponse> {
    try {
      const response = await this.plaid.accountsBalanceGet(
        {
          client_id: this.clientId,
          secret: this.secret,
          access_token: accessToken,
        },
        options,
      );

      return response.data;
    }
    catch (error) {
      throw new PlaidException(error);
    }
  }

  async getTransactions(
    accessToken: string,
    startDate: string,
    endDate: string,
    options?: Plaid.TransactionsGetRequestOptions,
  ): Promise<Plaid.TransactionsGetResponse> {
    try {
      const response = await this.plaid.transactionsGet(
        {
          client_id: this.clientId,
          secret: this.secret,
          access_token: accessToken,
          start_date: startDate,
          end_date: endDate,
        },
        options,
      );

      return response.data;
    }
    catch (error) {
      // console.log(JSON.stringify(error.response.data));
      throw new PlaidException(error);
    }
  }

  async getInstitutionById(
    institutionId: string,
    countryCodes: Plaid.CountryCode[],
    options?: Plaid.InstitutionsGetByIdRequestOptions,
  ): Promise<Plaid.InstitutionsGetByIdResponse> {
    try {
      const response = await this.plaid.institutionsGetById(
        {
          institution_id: institutionId,
          country_codes: countryCodes,
        },
        options,
      );

      return response.data;
    }
    catch (error) {
      throw new PlaidException(error);
    }
  }

  async updateItemWebhook(accessToken: string, webhook: string): Promise<Plaid.ItemWebhookUpdateResponse> {
    try {
      const response = await this.plaid.itemWebhookUpdate({
        client_id: this.clientId,
        secret: this.secret,
        access_token: accessToken,
        webhook,
      });

      return response.data;
    }
    catch (error) {
      throw new PlaidException(error);
    }
  }

  async resetLogin(accessToken: string): Promise<Plaid.SandboxItemResetLoginResponse> {
    try {
      const response = await this.plaid.sandboxItemResetLogin({
        client_id: this.clientId,
        secret: this.secret,
        access_token: accessToken,
      });

      return response.data;
    }
    catch (error) {
      throw new PlaidException(error);
    }
  }

  async sandboxItemFireWebhook(accessToken: string): Promise<Plaid.SandboxItemFireWebhookResponse> {
    try {
      const response = await this.plaid.sandboxItemFireWebhook({
        client_id: this.clientId,
        secret: this.secret,
        access_token: accessToken,
        webhook_code: Plaid.SandboxItemFireWebhookRequestWebhookCodeEnum.DefaultUpdate,
      });

      return response.data;
    }
    catch (error) {
      throw new PlaidException(error);
    }
  }
}

export default PlaidWrapper;
