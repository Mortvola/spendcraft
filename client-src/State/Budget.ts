import { CategoryBalanceProps } from '../../common/ResponseTypes';
import Category from './Category';
import Group from './Group';
import { CategoryInterface } from './Types';

class Budget extends Group {
  fundingPoolCat: Category | null = null;

  getFundingPool(): Category {
    if (this.fundingPoolCat === null) {
      throw new Error('fundingPoolCat not set')
    }

    return this.fundingPoolCat;
  }

  findCategory(categoryId: number): CategoryInterface | null {
    if (categoryId === this.fundingPoolCat?.id) {
      return this.fundingPoolCat
    }

    return super.findCategory(categoryId);
  }
}

export default Budget;
