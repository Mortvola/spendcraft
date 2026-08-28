import TaxCategory from '#models/TaxCategory'
import { BaseSeeder } from '@adonisjs/lucid/seeders'

export default class extends BaseSeeder {
  async run() {
    // Write your database queries inside the run method
    await TaxCategory.updateOrCreateMany('type', [
      { type: 'taxable_social_security_benefits', description: 'Taxable Social Security Benefits' },
      { type: 'estimated_tax_payments', description: 'Estimated Tax Payments' }
    ])
  }
}