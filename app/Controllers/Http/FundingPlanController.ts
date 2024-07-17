import { HttpContextContract } from '@ioc:Adonis/Core/HttpContext';
import { schema } from '@ioc:Adonis/Core/Validator';
import Category from 'App/Models/Category';
// import FundingPlan from 'App/Models/FundingPlan';
// import FundingPlanCategory from 'App/Models/FundingPlanCategory';
// import CategoryHistoryItem from 'App/Models/CategoryHistoryItem';
import { ApiResponse, FundingPlanDetailsProps, ProposedFundingCategoryProps } from 'Common/ResponseTypes';

class FundingPlanController {
  // eslint-disable-next-line class-methods-use-this
  public async getPlan({ auth: { user } }: HttpContextContract): Promise<FundingPlanDetailsProps> {
    if (!user) {
      throw new Error('user is undefined');
    }

    const budget = await user.related('budget').query().firstOrFail();

    const categories = await Category.query()
      .whereHas('group', (q) => {
        q.where('budgetId', budget.id)
      })

    // let history: CategoryHistoryItem[] = [];

    // if (h) {
    //   history = await budget.history(parseInt(h, 10));
    // }

    return {
      id: 0,
      categories: categories.map((c) => ({
        id: c.id,
        categoryId: c.id,
        amount: c.fundingAmount,
        useGoal: c.useGoal,
        goalDate: c.goalDate?.toISODate() ?? null,
        recurrence: c.recurrence,
      })),
      history: [],
    };
  }

  // eslint-disable-next-line class-methods-use-this
  public async getProposed({
    auth: {
      user,
    },
  }: HttpContextContract): Promise<ApiResponse<ProposedFundingCategoryProps[]>> {
    if (!user) {
      throw new Error('user is undefined');
    }

    const budget = await user.related('budget').query().firstOrFail();

    return {
      data: await budget.getProposedFunding(),
    }
  }

  // eslint-disable-next-line class-methods-use-this
  public async updateOrCreateCategory({
    request,
  }: HttpContextContract): Promise<Category> {
    const { catId } = request.params();

    const requestData = await request.validate({
      schema: schema.create({
        amount: schema.number(),
        useGoal: schema.boolean.optional(),
        goalDate: schema.date.optional(),
        recurrence: schema.number(),
      }),
    });

    const item = await Category.updateOrCreate(
      {
        id: parseInt(catId, 10),
      },
      {
        fundingAmount: requestData.amount,
        useGoal: requestData.useGoal ?? false,
        goalDate: requestData.goalDate ?? null,
        recurrence: requestData.recurrence,
      },
    );

    return item;
  }
}

export default FundingPlanController;
