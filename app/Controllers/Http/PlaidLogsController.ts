import PlaidLog from '#app/Models/PlaidLog';

export default class PlaidLogsController {
   
  async get() {
    return PlaidLog.query().orderBy('createdAt', 'desc')
  }
}
