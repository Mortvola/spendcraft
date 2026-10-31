import { formatMoneyCents } from '#common/moneyCents';
import { encodeMonetaryAmount } from '#services/categoryAmountCodec';
import { HttpContext } from '@adonisjs/core/http';
import { ApiResponse, FundingRuleResponse, ProposedFundingCategoryProps } from
  '#common/ResponseTypes';

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

    const proposed = await budget.getProposedFunding(date);
    return {
      data: proposed.map(({ amountCents, fundingCategories, ...category }) => ({
        ...category,
        amount: formatMoneyCents(amountCents),
        fundingCategories: fundingCategories.map<FundingRuleResponse>((rule) => rule
          .percentage
          ? { ...rule, percentage: rule.percentage, amount: rule.amount }
          : { ...rule, percentage: rule.percentage, amount: encodeMonetaryAmount(rule.amount) }),
      })),
    }
  }
}

export default FundingPlanController;
