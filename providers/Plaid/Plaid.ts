import PlaidException from './PlaidException';
import * as Plaid from 'plaid';

export type PlaidConfig = {
  clientId: string,
  sandboxSecret: string,
  productionSecret: string,
  environment: string,
}

class PlaidWrapper {
  plaid: Plaid.PlaidApi;

  constructor (config: PlaidConfig) {
    let secret = '';
    const env = config.environment;
    if (env === 'sandbox') {
      secret = config.sandboxSecret;
    }
    else if (env === 'production') {
      secret = config.productionSecret;
    }

    const clientConfig: Plaid.Configuration = new Plaid.Configuration({
      basePath: Plaid.PlaidEnvironments[env],
      baseOptions: {
        headers: {
          'PLAID-CLIENT-ID': config.clientId,
          'PLAID-SECRET': secret,  
        }
      },
    });

    try {
      this.plaid = new Plaid.PlaidApi(clientConfig);
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

      await PlaidWrapper.log(response.request?.path ?? '', response.data, response.status)

      return response.data;
    }
    catch (error) {
      await PlaidWrapper.log(error.response.request?.path ?? '', error.response.data, error.response.status)
      throw new PlaidException(error);
    }
  }

  async removeItem(accessToken: string): Promise<Plaid.ItemRemoveResponse> {
    try {
      const response = await this.plaid.itemRemove({
        access_token: accessToken,
      });

      await PlaidWrapper.log(response.request?.path ?? '', response.data, response.status)

      return response.data;
    }
    catch (error) {
      await PlaidWrapper.log(error.response.request?.path ?? '', error.response.data, error.response.status)
      throw new PlaidException(error);
    }
  }

  async getAccounts(this: PlaidWrapper, accessToken: string, options?: Plaid.AccountsGetRequestOptions): Promise<Plaid.AccountsGetResponse> {
    try {
      const param =         {
        access_token: accessToken,
        options,
      };

      const response = await this.plaid.accountsGet(
        param,
      );

      await PlaidWrapper.log(response.request?.path ?? '', response.data, response.status)

      return response.data;
    }
    catch (error) {
      await PlaidWrapper.log(error.response.request?.path ?? '', error.response.data, error.response.status)
      throw new PlaidException(error);
    }
  }

  async exchangePublicToken(publicToken: string): Promise<Plaid.ItemPublicTokenExchangeResponse> {
    try {
      const response = await this.plaid.itemPublicTokenExchange({ public_token: publicToken });

      await PlaidWrapper.log(response.request?.path ?? '', response.data, response.status)

      return response.data;
    }
    catch (error) {
      await PlaidWrapper.log(error.response.request?.path ?? '', error.response.data, error.response.status)
      throw new PlaidException(error);
    }
  }

  async createLinkToken(options: Plaid.LinkTokenCreateRequest): Promise<Plaid.LinkTokenCreateResponse> {
    try {
      const response = await this.plaid.linkTokenCreate(options);

      await PlaidWrapper.log(response.request?.path ?? '', response.data, response.status)

      return response.data;
    }
    catch (error) {
      await PlaidWrapper.log(error.response.request?.path ?? '', error.response.data, error.response.status)
      throw new PlaidException(error);
    }
  }

  async getWebhookVerificationKey(keyId: string): Promise<Plaid.WebhookVerificationKeyGetResponse> {
    try {
      const response = await this.plaid.webhookVerificationKeyGet({ key_id: keyId });

      await PlaidWrapper.log(response.request?.path ?? '', response.data, response.status)

      return response.data;
    }
    catch (error) {
      await PlaidWrapper.log(error.response.request?.path ?? '', error.response.data, error.response.status)
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

      await PlaidWrapper.log(response.request?.path ?? '', response.data, response.status)

      return response.data;
    }
    catch (error) {
      await PlaidWrapper.log(error.response.request?.path ?? '', error.response.data, error.response.status)
      throw new PlaidException(error);
    }
  }

  async syncTransactions(
    accessToken: string,
    cursor: string | null,
  ): Promise<Plaid.TransactionsSyncResponse> {
    try {
      const param: Plaid.TransactionsSyncRequest = {
        access_token: accessToken,
        cursor: cursor ?? undefined,
      }

      const response = await this.plaid.transactionsSync(param);

      await PlaidWrapper.log(response.request?.path ?? '', response.data, response.status)

      return response.data
    }
    catch (error) {
      await PlaidWrapper.log(error.response.request?.path ?? '', error.response.data, error.response.status)
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
      const param: Plaid.TransactionsGetRequest = {
        access_token: accessToken,
        start_date: startDate,
        end_date: endDate,
        options,
      };

      const response = await this.plaid.transactionsGet(
        param,
      );

      await PlaidWrapper.log(response.request?.path ?? '', response.data, response.status)

      return response.data;
    }
    catch (error) {
      await PlaidWrapper.log(error.response.request?.path ?? '', error.response.data, error.response.status)
      throw new PlaidException(error);
    }
  }

  async refreshTransactions(
    accessToken: string,
  ): Promise<Plaid.TransactionsRefreshResponse> {
    try {
      const param: Plaid.TransactionsRefreshRequest = {
        access_token: accessToken,
      }

      const response = await this.plaid.transactionsRefresh(param);

      await PlaidWrapper.log(response.request?.path ?? '', response.data, response.status)

      return response.data
    }
    catch (error) {
      await PlaidWrapper.log(error.response.request?.path ?? '', error.response.data, error.response.status)
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

      await PlaidWrapper.log(response.request?.path ?? '', response.data, response.status)

      return response.data;
    }
    catch (error) {
      await PlaidWrapper.log(error.response.request?.path ?? '', error.response.data, error.response.status)
      throw new PlaidException(error);
    }
  }

  async searchInstitutions(
    query: string,
  ) {
    try {
      const response = await this.plaid.institutionsSearch({
        query,
        products: [Plaid.Products.Transactions],
        country_codes: [Plaid.CountryCode.Us]
      })

      await PlaidWrapper.log(response.request?.path ?? '', response.data, response.status)

      return response.data;
    }
    catch (error) {
      await PlaidWrapper.log(error.response.request?.path ?? '', error.response.data, error.response.status)
      throw new PlaidException(error);
    }
  }

  async updateItemWebhook(accessToken: string, webhook: string): Promise<Plaid.ItemWebhookUpdateResponse> {
    try {
      const response = await this.plaid.itemWebhookUpdate({
        access_token: accessToken,
        webhook,
      });

      await PlaidWrapper.log(response.request?.path ?? '', response.data, response.status)

      return response.data;
    }
    catch (error) {
      await PlaidWrapper.log(error.response.request?.path ?? '', error.response.data, error.response.status)
      throw new PlaidException(error);
    }
  }

  async resetLogin(accessToken: string): Promise<Plaid.SandboxItemResetLoginResponse> {
    try {
      const response = await this.plaid.sandboxItemResetLogin({
        access_token: accessToken,
      });

      await PlaidWrapper.log(response.request?.path ?? '', response.data, response.status)

      return response.data;
    }
    catch (error) {
      await PlaidWrapper.log(error.response.request?.path ?? '', error.response.data, error.response.status)
      throw new PlaidException(error);
    }
  }

  async sandboxItemFireWebhook(accessToken: string, code: Plaid.SandboxItemFireWebhookRequestWebhookCodeEnum): Promise<Plaid.SandboxItemFireWebhookResponse> {
    try {
      const response = await this.plaid.sandboxItemFireWebhook({
        access_token: accessToken,
        webhook_code: code,
      });

      await PlaidWrapper.log(response.request?.path ?? '', response.data, response.status)

      return response.data;
    }
    catch (error) {
      await PlaidWrapper.log(error.response.request?.path ?? '', error.response.data, error.response.status)
      throw new PlaidException(error);
    }
  }

  async getCategories(): Promise<Plaid.Category[]> {
    try {
      const response = await this.plaid.categoriesGet({});

      await PlaidWrapper.log(response.request?.path ?? '', response.data, response.status)

      return response.data.categories;
    }
    catch (error) {
      await PlaidWrapper.log(error.response.request?.path ?? '', error.response.data, error.response.status)
      throw new PlaidException(error);
    }
  }

  static async log(request: string, response: unknown, status: number) {
    const { default: PlaidLog } = await import('App/Models/PlaidLog')

    await new PlaidLog()
      .useConnection('pgLog')
      .fill({
        request,
        response,
        status,
      })
      .save();
  }
}

export default PlaidWrapper;
