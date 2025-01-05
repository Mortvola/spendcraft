import { CategoryBalanceProps } from '../../common/ResponseTypes';
import Category from './Category';
import Group from './Group';

class Budget extends Group {
  fundingPoolCat: Category | null = null;

  getFundingPool(): Category {
    if (this.fundingPoolCat === null) {
      throw new Error('fundingPoolCat not set')
    }

    return this.fundingPoolCat;
  }

  updateBalances(balances: CategoryBalanceProps[]): void {
    if (this.fundingPoolCat) {
      this.fundingPoolCat.updateBalances(balances)
    }

    super.updateBalances(balances)
  }
}

export default Budget;
