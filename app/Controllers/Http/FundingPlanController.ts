import { HttpContextContract } from '@ioc:Adonis/Core/HttpContext';
import { schema } from '@ioc:Adonis/Core/Validator';
import Database from '@ioc:Adonis/Lucid/Database';
import FundingPlan, { Plan } from 'App/Models/FundingPlan';
import FundingPlanCategory from 'App/Models/FundingPlanCategory';
import { UpdateFundingCategoryResponse } from 'common/ResponseTypes';

class FundingPlanController {
  // eslint-disable-next-line class-methods-use-this
  public async add({
    auth: {
      user,
    },
    request,
  }: HttpContextContract): Promise<FundingPlan> {
    if (!user) {
      throw new Error('user is undefined');
    }

    const application = await user.related('application').query().firstOrFail();

    const validationSchema = schema.create({
      name: schema.string(),
    });

    const requestData = await request.validate({
      schema: validationSchema,
    });

    const plan = new FundingPlan();

    plan.name = requestData.name;

    await plan.related('application').associate(application);

    return plan;
  }

  // eslint-disable-next-line class-methods-use-this
  public async getAll({
    auth: {
      user,
    },
  }: HttpContextContract): Promise<FundingPlan[]> {
    if (!user) {
      throw new Error('user is undefined');
    }

    const application = await user.related('application').query().firstOrFail();

    return FundingPlan.query().where('applicationId', application.id);
  }

  // eslint-disable-next-line class-methods-use-this
  public async getPlan({ request }: HttpContextContract): Promise<Record<string, unknown>> {
    const planId = parseInt(request.params().planId, 10);

    const categories = await FundingPlanCategory
      .query()
      .select('category_id', Database.raw('CAST(amount AS DOUBLE PRECISION) AS amount'))
      .where('plan_id', planId);

    return {
      id: planId,
      categories,
    };
  }

  // eslint-disable-next-line class-methods-use-this
  public async getFullPlan({ request, auth: { user } }: HttpContextContract): Promise<Plan> {
    if (!user) {
      throw new Error('user is undefined');
    }

    const application = await user.related('application').query().firstOrFail();

    const plan = await FundingPlan.find(request.params().planId);

    if (!plan) {
      throw new Error('plan not found');
    }

    return plan.getFullPlan(application);
  }

  // eslint-disable-next-line class-methods-use-this
  public async updateCategory({
    request,
  }: HttpContextContract): Promise<UpdateFundingCategoryResponse> {
    const validationSchema = schema.create({
      amount: schema.number(),
    });

    const { planId, catId } = request.params();
    const requestData = await request.validate({
      schema: validationSchema,
    });

    const category = await FundingPlanCategory.updateOrCreate(
      {
        planId,
        categoryId: catId,
      },
      {
        amount: requestData.amount,
      },
    );

    return {
      amount: category.amount,
      categoryId: category.categoryId,
    };
  }
}

export default FundingPlanController;
