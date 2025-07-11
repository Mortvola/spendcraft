import { observable, runInAction } from 'mobx';
import type Category from './Category';
import type {
  AccountInterface,
  CategoryInterface,
  FundingPlanInterface,
  StoreInterface, TransactionInterface, UIStateInterface,
} from './Types';
import type Plaid from './Plaid';
import type Statement from './Statement';

class UIState implements UIStateInterface {
  @observable
  accessor selectedCategory: CategoryInterface | null = null;

  @observable
  accessor selectedPlan: FundingPlanInterface | null = null;

  @observable
  accessor selectedAccount: AccountInterface | null = null;

  @observable
  accessor selectedStatement: Statement | null = null;

  @observable
  accessor selectedTransaction: TransactionInterface | null = null;

  @observable
  accessor plaid: Plaid | null = null;

  store: StoreInterface;

  constructor(store: StoreInterface) {
    this.store = store;
  }

  selectCategory(category: Category | null): void {
    runInAction(() => {
      this.selectedCategory = category;
    });
  }

  selectAccount(account: AccountInterface | null): void {
    runInAction(() => {
      this.selectedAccount = account;
    });
  }

  selectStatement(statement: Statement | null): void {
    runInAction(() => {
      this.selectedStatement = statement;
    })
  }

  selectPlan(plan: FundingPlanInterface | null): void {
    runInAction(() => {
      this.selectedPlan = plan;
    });
  }

  selectTransaction(transaction: TransactionInterface | null): void {
    runInAction(() => {
      this.selectedTransaction = transaction;
    });
  }
}

export default UIState;
