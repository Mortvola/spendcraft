// import type { HttpContext } from '@adonisjs/core/http'

import { ApiResponse, TaxProps } from "#common/ResponseTypes";
import Tax from "#models/Tax";
import { addTax } from "#validators/tax";
import { HttpContext } from "@adonisjs/core/http";

export default class TaxesController {
  async get(): Promise<ApiResponse<TaxProps>> {
    const tax = await Tax.findByOrFail('year', 2026)

    return {
      data: tax,
    }
  }

  async post({ request }: HttpContext): Promise<ApiResponse<TaxProps>> {
    const requestData = await request.validateUsing(addTax);
    
    const tax = await Tax.updateOrCreate(
      {
        year: requestData.year
      },
      {
        year: requestData.year,
        data: requestData.data,
      }
    )

    return {
      data: tax,
    };
  }
}