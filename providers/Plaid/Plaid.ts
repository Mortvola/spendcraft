import PlaidException from './PlaidException';
import Plaid, {
  Institution, PlaidError,
  Transaction,
  PlaidApi,
  PlaidEnvironments,
  Configuration,
  CountryCode,
  Products,
  TransactionsGetResponse,
  AccountsGetResponse,
  Category,
} from 'plaid';

export {
  CountryCode, Products,
  Institution as PlaidInstitution,
  PlaidError, Transaction as PlaidTransaction,
  TransactionsGetResponse,
  AccountsGetResponse,
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

    const clientConfig: Configuration = new Configuration({
      basePath: PlaidEnvironments[env],
      baseOptions: {
        headers: {
          'PLAID-CLIENT-ID': config.clientId,
          'PLAID-SECRET': secret,  
        }
      },
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
      const param =         {
        access_token: accessToken,
        options,
      };

      console.log(`param = ${JSON.stringify(param)}`);

      const response = await this.plaid.accountsGet(
        param,
      );

      return response.data;
    }
    catch (error) {
      console.log(JSON.stringify(error.response.data));
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
      console.log(`options: ${JSON.stringify(options)}`);
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
      const param = {
        access_token: accessToken,
        start_date: startDate,
        end_date: endDate,
        options,
      };

      console.log(JSON.stringify(param));
      const response = await this.plaid.transactionsGet(
        param,
      );

      return response.data;
    }
    catch (error) {
      console.log(JSON.stringify(error.response.data));
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
        access_token: accessToken,
        webhook_code: Plaid.SandboxItemFireWebhookRequestWebhookCodeEnum.DefaultUpdate,
      });

      return response.data;
    }
    catch (error) {
      throw new PlaidException(error);
    }
  }

  async getCategories(): Promise<Category[]> {
    const response = await this.plaid.categoriesGet({});

    return response.data.categories;
  }
}

export default PlaidWrapper;
