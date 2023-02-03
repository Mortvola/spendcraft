import { HttpContextContract } from '@ioc:Adonis/Core/HttpContext';
import { schema } from '@ioc:Adonis/Core/Validator';
import FundingPlan from 'App/Models/FundingPlan';
import FundingPlanCategory from 'App/Models/FundingPlanCategory';
import CategoryHistoryItem from 'App/Models/CategoryHistoryItem';
import { FundingPlanDetailsProps, ProposedFundingCateggoryProps } from 'Common/ResponseTypes';

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
  public async getPlan({ request, auth: { user } }: HttpContextContract): Promise<FundingPlanDetailsProps> {
    if (!user) {
      throw new Error('user is undefined');
    }

    const { h } = request.qs();

    const application = await user.related('application').query().firstOrFail();

    const planId = parseInt(request.params().planId, 10);

    const categories = await FundingPlanCategory.query().where('planId', planId);

    let history: CategoryHistoryItem[] = [];

    if (h) {
      history = await application.history(parseInt(h, 10));
    }

    return {
      id: planId,
      categories: categories.map((c) => ({
        id: c.id,
        categoryId: c.categoryId,
        amount: c.amount,
        useGoal: c.useGoal,
        goalDate: c.goalDate?.toISODate() ?? null,
        recurrence: c.recurrence,
      })),
      history,
    };
  }

  // eslint-disable-next-line class-methods-use-this
  public async getProposed({ request, auth: { user } }: HttpContextContract): Promise<ProposedFundingCateggoryProps[]> {
    if (!user) {
      throw new Error('user is undefined');
    }

    const planId = parseInt(request.params().planId, 10);

    const application = await user.related('application').query().firstOrFail();

    return application.getProposedFunding(planId);
  }

  // eslint-disable-next-line class-methods-use-this
  // public async getFullPlan({ request, auth: { user } }: HttpContextContract): Promise<Plan> {
  //   if (!user) {
  //     throw new Error('user is undefined');
  //   }

  //   const application = await user.related('application').query().firstOrFail();

  //   const plan = await FundingPlan.find(request.params().planId);

  //   if (!plan) {
  //     throw new Error('plan not found');
  //   }

  //   return plan.getFullPlan(application);
  // }

  // eslint-disable-next-line class-methods-use-this
  public async updateOrCreateCategory({
    request,
  }: HttpContextContract): Promise<FundingPlanCategory> {
    const { planId, catId } = request.params();

    const requestData = await request.validate({
      schema: schema.create({
        amount: schema.number(),
        useGoal: schema.boolean.optional(),
        goalDate: schema.date.optional(),
        recurrence: schema.number(),
        expectedToSpend: schema.number.optional(),
      }),
    });

    const item = await FundingPlanCategory.updateOrCreate(
      {
        planId: parseInt(planId, 10),
        categoryId: parseInt(catId, 10),
      },
      {
        amount: requestData.amount,
        useGoal: requestData.useGoal ?? false,
        goalDate: requestData.goalDate ?? null,
        recurrence: requestData.recurrence,
        expectedToSpend: requestData.expectedToSpend ?? null,
      },
    );

    return item;
  }
}

export default FundingPlanController;
