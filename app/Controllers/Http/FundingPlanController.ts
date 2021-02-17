import { HttpContextContract } from '@ioc:Adonis/Core/HttpContext';
import Database from '@ioc:Adonis/Lucid/Database';
import FundingPlan, { Plan, PlanCategory } from 'App/Models/FundingPlan';
import FundingPlanCategory from 'App/Models/FundingPlanCategory';

class FundingPlanController {
  // eslint-disable-next-line class-methods-use-this
  public async add({
    auth: {
      user,
    },
    request,
  }: HttpContextContract) {
    if (!user) {
      throw new Error('user is undefined');
    }

    const plan = new FundingPlan();

    plan.name = request.input('name');

    await plan.related('user').associate(user);

    return plan;
  }

  // eslint-disable-next-line class-methods-use-this
  public async getAll({
    auth: {
      user,
    },
  }: HttpContextContract): Promise<Array<Record<string, unknown>>> {
    if (!user) {
      throw new Error('user is undefined');
    }

    return Database.query()
      .select('id', 'name')
      .from('funding_plans')
      .where('user_id', user.id);
  }

  // eslint-disable-next-line class-methods-use-this
  public async getPlan({ request }: HttpContextContract): Promise<Record<string, unknown>> {
    const planId = parseInt(request.params().planId, 10);

    const categories = await FundingPlanCategory
      .query()
      .select('category_id', 'amount')
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

    const plan = await FundingPlan.find(request.params().planId);

    if (!plan) {
      throw new Error('plan not found');
    }

    return plan.getFullPlan(user);
  }

  // eslint-disable-next-line class-methods-use-this
  public async updateCategory({ request }: HttpContextContract): Promise<PlanCategory> {
    const category = await FundingPlanCategory.findOrFail(request.params().itemId);

    category.amount = request.input('amount');

    category.save();

    return {
      id: category.id,
      balance: category.amount,
      categoryId: category.categoryId,
    };
  }

  // eslint-disable-next-line class-methods-use-this
  public async insertCategory({ request }: HttpContextContract): Promise<PlanCategory> {
    const category = await FundingPlanCategory.create({
      planId: request.params().planId,
      categoryId: request.params().categoryId,
      amount: request.input('amount'),
    });

    return {
      id: category.id,
      balance: category.amount,
      categoryId: category.categoryId,
    };
  }
}

export default FundingPlanController;
