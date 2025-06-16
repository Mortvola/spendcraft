// import type { HttpContextContract } from '@ioc:Adonis/Core/HttpContext'

import PlaidLog from '#app/Models/PlaidLog';

export default class PlaidLogsController {
  // eslint-disable-next-line class-methods-use-this
  async get() {
    return PlaidLog.query().orderBy('createdAt', 'desc')
  }
}
