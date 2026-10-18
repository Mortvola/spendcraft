import { HttpContext } from '@adonisjs/core/http';
import { ApiResponse, ProposedFundingCategoryProps } from '#common/ResponseTypes';

class FundingPlanController {
   
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
}

export default FundingPlanController;
