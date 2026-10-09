import Institution from '#app/Models/Institution';
import { DateTime } from 'luxon';
import PlaidException from './PlaidException.js';
import * as Plaid from 'plaid';
export { type WebhookVerificationKeyGetResponse } from 'plaid';

export interface PlaidConfig {
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
      throw PlaidException.from(error);
    }
  }

  async getItem(
    institution: Institution,
  ): Promise<Plaid.ItemGetResponse> {
    if (!institution.accessToken) {
      throw new Error('Institution does not have an access token')
    }

    try {
      const response = await this.plaid.itemGet({
        access_token: institution.accessToken,
      });

      if (!institution.institutionId) {
        throw new Error('institutionId is null')
      }

      await PlaidWrapper.log(response.request?.path ?? '', response.data, response.status, institution.institutionId)

      return response.data;
    }
    catch (error) {
      return PlaidWrapper.fail(error, institution.institutionId);
    }
  }

  async removeItem(
    accessToken: string,
    institutionId?: string,
  ): Promise<Plaid.ItemRemoveResponse> {
    try {
      const response = await this.plaid.itemRemove({
        access_token: accessToken,
      });

      await PlaidWrapper.log(response.request?.path ?? '', response.data, response.status, institutionId)

      return response.data;
    }
    catch (error) {
      return PlaidWrapper.fail(error, institutionId);
    }
  }

  async getAccounts(
    this: PlaidWrapper,
    institution: Institution,
    options?: Plaid.AccountsGetRequestOptions,
  ): Promise<Plaid.AccountsGetResponse> {
    if (!institution.accessToken) {
      throw new Error('Institution does not have an access token')
    }

    try {
      const response = await this.plaid.accountsGet({
        access_token: institution.accessToken,
        options,
      });

      await PlaidWrapper.log(response.request?.path ?? '', response.data, response.status, institution.institutionId)

      return response.data;
    }
    catch (error) {
      return PlaidWrapper.fail(error, institution.institutionId);
    }
  }

  async exchangePublicToken(publicToken: string): Promise<Plaid.ItemPublicTokenExchangeResponse> {
    try {
      const response = await this.plaid.itemPublicTokenExchange({ public_token: publicToken });

      await PlaidWrapper.log(response.request?.path ?? '', response.data, response.status)

      return response.data;
    }
    catch (error) {
      return PlaidWrapper.fail(error);
    }
  }

  async createLinkToken(options: Plaid.LinkTokenCreateRequest): Promise<Plaid.LinkTokenCreateResponse> {
    try {
      const response = await this.plaid.linkTokenCreate(options);

      await PlaidWrapper.log(response.request?.path ?? '', response.data, response.status)

      return response.data;
    }
    catch (error) {
      return PlaidWrapper.fail(error);
    }
  }

  async getWebhookVerificationKey(keyId: string): Promise<Plaid.WebhookVerificationKeyGetResponse> {
    try {
      const response = await this.plaid.webhookVerificationKeyGet({ key_id: keyId });

      await PlaidWrapper.log(response.request?.path ?? '', response.data, response.status)

      return response.data;
    }
    catch (error) {
      return PlaidWrapper.fail(error);
    }
  }

  async getBalance(
    institution: Institution,
    options?: Plaid.AccountsBalanceGetRequestOptions,
  ): Promise<Plaid.AccountsGetResponse> {
    if (!institution.accessToken) {
      throw new Error('Institution does not have an access token')
    }

    try {
      const response = await this.plaid.accountsBalanceGet({
        access_token: institution.accessToken,
        options,
      });

      await PlaidWrapper.log(response.request?.path ?? '', response.data, response.status, institution.institutionId)

      return response.data;
    }
    catch (error) {
      return PlaidWrapper.fail(error, institution.institutionId);
    }
  }

  async syncTransactions(
    institution: Institution,
    cursor: string | null,
  ): Promise<Plaid.TransactionsSyncResponse> {
    if (!institution.accessToken) {
      throw new Error('Institution does not have an access token')
    }

    try {
      const param: Plaid.TransactionsSyncRequest = {
        access_token: institution.accessToken,
        cursor: cursor ?? undefined,
      }

      const response = await this.plaid.transactionsSync(param);

      await PlaidWrapper.log(response.request?.path ?? '', response.data, response.status, institution.institutionId)

      return response.data
    }
    catch (error) {
      return PlaidWrapper.fail(error, institution.institutionId);
    }
  }

  async getTransactions(
    institution: Institution,
    startDate: string,
    endDate: string,
    options?: Plaid.TransactionsGetRequestOptions,
  ): Promise<Plaid.TransactionsGetResponse> {
    if (!institution.accessToken) {
      throw new Error('Institution does not have an access token')
    }

    try {
      const response = await this.plaid.transactionsGet({
        access_token: institution.accessToken,
        start_date: startDate,
        end_date: endDate,
        options,
      });

      await PlaidWrapper.log(response.request?.path ?? '', response.data, response.status, institution.institutionId)

      return response.data;
    }
    catch (error) {
      return PlaidWrapper.fail(error, institution.institutionId);
    }
  }

  async refreshTransactions(
    institution: Institution,
  ): Promise<Plaid.TransactionsRefreshResponse> {
    if (!institution.accessToken) {
      throw new Error('Institution does not have an access token')
    }

    try {
      const param: Plaid.TransactionsRefreshRequest = {
        access_token: institution.accessToken,
      }

      const response = await this.plaid.transactionsRefresh(param);

      await PlaidWrapper.log(response.request?.path ?? '', response.data, response.status, institution.institutionId)

      return response.data
    }
    catch (error) {
      return PlaidWrapper.fail(error, institution.institutionId);
    }
  }

  async getInstitutionById(
    institutionId: string,
    countryCodes: Plaid.CountryCode[],
    options?: Plaid.InstitutionsGetByIdRequestOptions,
  ): Promise<Plaid.InstitutionsGetByIdResponse> {
    try {
      const response = await this.plaid.institutionsGetById({
        institution_id: institutionId,
        country_codes: countryCodes,
        options,
      });

      await PlaidWrapper.log(response.request?.path ?? '', response.data, response.status)

      return response.data;
    }
    catch (error) {
      return PlaidWrapper.fail(error);
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
      return PlaidWrapper.fail(error);
    }
  }

  async updateItemWebhook(
    institution: Institution,
    webhook: string,
  ): Promise<Plaid.ItemWebhookUpdateResponse> {
    if (!institution.accessToken) {
      throw new Error('Institution does not have an access token')
    }

    try {
      const response = await this.plaid.itemWebhookUpdate({
        access_token: institution.accessToken,
        webhook,
      });

      await PlaidWrapper.log(response.request?.path ?? '', response.data, response.status, institution.institutionId)

      return response.data;
    }
    catch (error) {
      return PlaidWrapper.fail(error, institution.institutionId);
    }
  }

  async resetLogin(
    institution: Institution,
  ): Promise<Plaid.SandboxItemResetLoginResponse> {
    if (!institution.accessToken) {
      throw new Error('Institution does not have an access token')
    }

    try {
      const response = await this.plaid.sandboxItemResetLogin({
        access_token: institution.accessToken,
      });

      await PlaidWrapper.log(response.request?.path ?? '', response.data, response.status, institution.institutionId)

      return response.data;
    }
    catch (error) {
      return PlaidWrapper.fail(error, institution.institutionId);
    }
  }

  async sandboxItemFireWebhook(
    institution: Institution,
    code: Plaid.SandboxItemFireWebhookRequestWebhookCodeEnum,
  ): Promise<Plaid.SandboxItemFireWebhookResponse> {
    if (!institution.accessToken) {
      throw new Error('Institution does not have an access token')
    }

    try {
      const response = await this.plaid.sandboxItemFireWebhook({
        access_token: institution.accessToken,
        webhook_code: code,
      });

      await PlaidWrapper.log(response.request?.path ?? '', response.data, response.status, institution.institutionId)

      return response.data;
    }
    catch (error) {
      return PlaidWrapper.fail(error, institution.institutionId);
    }
  }

  async getCategories(): Promise<Plaid.Category[]> {
    try {
      const response = await this.plaid.categoriesGet({});

      await PlaidWrapper.log(response.request?.path ?? '', response.data, response.status)

      return response.data.categories;
    }
    catch (error) {
      return PlaidWrapper.fail(error);
    }
  }

  private static async fail(error: unknown, institutionId?: string | null): Promise<never> {
    const failure = PlaidException.from(error);
    if (failure instanceof PlaidException) {
      // from() has established that this is an HTTP response with a Plaid body.
      if (typeof error === 'object' && error !== null && 'response' in error
        && typeof error.response === 'object' && error.response !== null
        && 'status' in error.response && typeof error.response.status === 'number') {
        const request = 'request' in error.response ? error.response.request : undefined;
        const path = typeof request === 'object' && request !== null && 'path' in request && typeof request.path === 'string' ? request.path : '';
        await PlaidWrapper.log(path, failure.plaidError, error.response.status, institutionId);
      }
    }
    throw failure;
  }

  static async log(request: string, response: unknown, status: number, institutionId?: string | null) {
    const { default: PlaidLog } = await import('#models/PlaidLog')

    await new PlaidLog()
      .useConnection('pgLog')
      .fill({
        request,
        response,
        status,
        institutionId,
      })
      .save();

      // Delete logs that are older than 90 days
      const results = await PlaidLog.query()
        .where('created_at', '<', DateTime.now().minus({ days: 90 }).toISODate())

      for (const record of results) {
        await record.delete()
      }
  }
}

declare module '@adonisjs/core/types' {
  interface ContainerBindings {
    plaid: PlaidWrapper
  }
}

export default PlaidWrapper;
