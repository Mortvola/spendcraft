import { HttpContext } from '@adonisjs/core/http';
import { schema } from '@adonisjs/validator';
import Category from '#app/Models/Category';
// import FundingPlan from 'App/Models/FundingPlan';
// import FundingPlanCategory from 'App/Models/FundingPlanCategory';
// import CategoryHistoryItem from 'App/Models/CategoryHistoryItem';
import { ApiResponse, FundingPlanDetailsProps, ProposedFundingCategoryProps } from '#common/ResponseTypes';

class FundingPlanController {
   
  public async getPlan({ auth: { user } }: HttpContext): Promise<FundingPlanDetailsProps> {
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

   
  public async getProposed({
    auth: {
      user,
    },
    request,
  }: HttpContext): Promise<ApiResponse<ProposedFundingCategoryProps[]>> {
    if (!user) {
      throw new Error('user is undefined');
    }

    const budget = await user.related('budget').query().firstOrFail();

    const { date } = request.qs();

    return {
      data: await budget.getProposedFunding(date),
    }
  }

   
  public async updateOrCreateCategory({
    request,
  }: HttpContext): Promise<Category> {
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
