/* eslint-disable import/no-cycle */
import PlaidException from 'App/Exceptions/PlaidException';
import * as Plaid from 'plaid';

class PlaidWrapper {
  plaid: Plaid.Client;

  constructor (configs: Plaid.ClientConfigs) {
    this.plaid = new Plaid.Client(configs);
  }

  async getItem(accessToken: string): Promise<Plaid.ItemResponse> {
    try {
      return await this.plaid.getItem(accessToken);
    }
    catch (error) {
      throw new PlaidException(error);
    }
  }

  async getAccounts(accessToken: string, options?: Plaid.ItemRequestOptions): Promise<Plaid.AccountsResponse> {
    try {
      return await this.plaid.getAccounts(accessToken, options);
    }
    catch (error) {
      throw new PlaidException(error);
    }
  }

  async exchangePublicToken(publicToken: string): Promise<Plaid.TokenResponse> {
    try {
      return await this.plaid.exchangePublicToken(publicToken)
    }
    catch (error) {
      throw new PlaidException(error);
    }
  }

  async createLinkToken(options: Plaid.CreateLinkTokenOptions): Promise<Plaid.CreateLinkTokenResponse> {
    try {
      return await this.plaid.createLinkToken(options);
    }
    catch (error) {
      throw new PlaidException(error);
    }
  }

  async getWebhookVerificationKey(keyId: string): Promise<Plaid.WebhookVerificationKeyResponse> {
    try {
      return await this.plaid.getWebhookVerificationKey(keyId);
    }
    catch (error) {
      throw new PlaidException(error);
    }
  }

  async getBalance(accessToken: string, options?: Plaid.BalanceRequestOptions): Promise<Plaid.AccountsResponse> {
    try {
      return await this.plaid.getBalance(accessToken, options);
    }
    catch (error) {
      throw new PlaidException(error);
    }
  }

  async getTransactions(
    accessToken: string,
    startDate: string,
    endDate: string,
    options?: Plaid.TransactionsRequestOptions,
  ): Promise<Plaid.TransactionsResponse> {
    try {
      return await this.plaid.getTransactions(accessToken, startDate, endDate, options);
    }
    catch (error) {
      throw new PlaidException(error);
    }
  }

  async getInstitutionById(
    institutionId: string,
    countryCodes: string[],
    options?: Plaid.GetInstitutionByIdOptions,
  ): Promise<Plaid.GetInstitutionByIdResponse<Plaid.Institution>> {
    try {
      return await this.plaid.getInstitutionById(institutionId, countryCodes, options);
    }
    catch (error) {
      throw new PlaidException(error);
    }
  }

  async updateItemWebhook(accessToken: string, webhook: string): Promise<Plaid.ItemResponse> {
    try {
      return await this.plaid.updateItemWebhook(accessToken, webhook);
    }
    catch (error) {
      throw new PlaidException(error);
    }
  }

  async resetLogin(accessToken: string): Promise<Plaid.ResetLoginResponse> {
    try {
      return await this.plaid.resetLogin(accessToken);
    }
    catch (error) {
      throw new PlaidException(error);
    }
  }

  async sandboxItemFireWebhook(accessToken: string): Promise<Plaid.SandboxItemFireWebhookResponse> {
    try {
      return await this.plaid.sandboxItemFireWebhook(accessToken, 'DEFAULT_UPDATE');
    }
    catch (error) {
      throw new PlaidException(error);
    }
  }
}

export default PlaidWrapper;
