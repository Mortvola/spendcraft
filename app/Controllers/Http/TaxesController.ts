// import type { HttpContext } from '@adonisjs/core/http'

import { ApiResponse, TaxActualProps, TaxCategoriesProps, TaxProps } from "#common/ResponseTypes";
import Statement from "#models/Statement";
import Tax from "#models/Tax";
import TaxCategory from "#models/TaxCategory";
import Transaction from "#models/Transaction";
import { addTax } from "#validators/tax";
import { HttpContext } from "@adonisjs/core/http";
import db from '@adonisjs/lucid/services/db';
import { DateTime } from "luxon";

export default class TaxesController {
  async get({
    request,
    auth: {
      user,
    }
  }: HttpContext): Promise<ApiResponse<TaxProps>> {
    if (!user) {
      throw new Error('user not defined');
    }

    const budget = await user.related('budget').query().firstOrFail();

    const { year } = request.params();

    const tax = await budget.related('tax').query()
      .where('year', year)
      .first()

    const actuals = await TaxesController.getActuals(year, budget.id);

    return {
      data: {
        year: tax?.year ?? DateTime.now().year,
        forecast: !tax ? undefined : {
          ...tax.data,
        },
        actuals,
      }
    }
  }

  static async getActuals(year: number, budgetId: number): Promise<TaxActualProps[]> {
    const actuals = await Statement.query()
      .whereHas('account', (acctQuery) => {
        acctQuery
          .whereNotIn('subtype', ['401k', 'Roth 401k', 'Roth', 'ira'])
          .whereHas('institution', (instQuery) => {
            instQuery.whereHas('budget', (budgetQuery) => {
              budgetQuery.where('id', budgetId)
            })
          })
      })
      .select(
        db.raw("EXTRACT(MONTH from end_date)::integer as month"),
        db.raw("sum(COALESCE((data->>'longTermCapitalGains')::real, 0)) as \"longTermCapitalGains\""),
        db.raw("sum(COALESCE((data->>'shortTermCapitalGains')::real, 0)) as \"shortTermCapitalGains\""),
        db.raw("sum(COALESCE((data->>'dividends')::real, 0)) as \"ordinaryDividends\""),
        db.raw("sum(COALESCE((data->>'taxableInterest')::real, 0)) as \"taxableInterest\""),
      )
      .whereBetween('startDate', [`${year}-01-01`, `${year}-12-31`])
      .groupByRaw('EXTRACT(MONTH from end_date)')

    // Retrieve any taxes associated with transactions
    const t = await Transaction.query()
      .select(
        db.raw("EXTRACT(MONTH from date)::integer as month"),
        db.raw("(transTaxes.type) as \"tax_type\""),
        db.raw("sum(COALESCE((transTaxes.amount), 0)) as \"tax_amount\"")
      )
      .joinRaw(
        'cross join lateral jsonb_to_recordset(transactions.taxes) as transTaxes(type varchar, amount real)'
      )
      .whereBetween('date', [`${year}-01-01`, `${year}-12-31`])
      .groupByRaw('EXTRACT(MONTH from date)')
      .groupByRaw('transTaxes.type')

    const taxes: Record<number, Record<string, number>> = {}

    for (const tax of t) {
      taxes[tax.$extras.month] = {
        ...taxes[tax.$extras.month],
        [tax.$extras.tax_type]: tax.$extras.tax_amount
      }
    }

    const result: TaxActualProps[] = []

    for (let i = 1; i <= 12; i += 1) {
      const a = actuals.find((a2) => a2.$extras.month === i)

      if (a) {
        result[i - 1] = {
          month: i,
          taxableInterest: a.$extras.taxableInterest ?? 0,
          ordinaryDividends: a.$extras.ordinaryDividends ?? 0,
          shortTermCapitalGains: a.$extras.shortTermCapitalGains ?? 0,
          longTermCapitalGains: a.$extras.longTermCapitalGains ?? 0,
          taxes: {},
        }
      }

      if (taxes[i]) {
        result[i - 1] = {
          ...result[i - 1],
          month: i,
          taxes: taxes[i],
        }
      }
    }
  
    return result;
  }

  async post({
    request,
    auth: {
      user,
    }
  }: HttpContext): Promise<ApiResponse<TaxProps>> {
    if (!user) {
      throw new Error('user not defined');
    }

    const budget = await user.related('budget').query().firstOrFail();

    const requestData = await request.validateUsing(addTax);
    
    const tax = await Tax.updateOrCreate(
      {
        year: requestData.year,
        budgetId: budget.id,
      },
      {
        data: requestData.forecast,
      }
    )

    const actuals = await TaxesController.getActuals(tax.year, budget.id);

    return {
      data: {
        year: tax.year,
        forecast: {
          ...tax.data,
        },
        actuals,
      },
    };
  }

  async getCategories(): Promise<ApiResponse<TaxCategoriesProps>> {
    const taxCategories = await TaxCategory.all();

    return {
      data: {
        taxCategories: taxCategories.map((taxcat) => ({
          type: taxcat.type,
          description: taxcat.description,
        }))
      }
    }
  }
}