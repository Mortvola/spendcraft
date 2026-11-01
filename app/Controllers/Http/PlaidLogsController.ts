import type { ApiResponse } from '#common/ResponseTypes';
import PlaidLog from '#app/Models/PlaidLog';
import WebhookLog from '#models/WebhookLog';

export default class PlaidLogsController {
   
  async get(): Promise<ApiResponse<(PlaidLog | WebhookLog)[]>> {
    const plaidLogs = await PlaidLog.query()
    const webhookLogs = await WebhookLog.query()

    const logs = [...plaidLogs, ...webhookLogs]
    logs.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis())

    return { data: logs }
  }
}
