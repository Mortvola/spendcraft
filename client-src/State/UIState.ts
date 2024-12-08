import { makeAutoObservable, runInAction } from 'mobx';
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
  selectedCategory: CategoryInterface | null = null;

  selectedPlan: FundingPlanInterface | null = null;

  selectedAccount: AccountInterface | null = null;

  selectedStatement: Statement | null = null;

  selectedTransaction: TransactionInterface | null = null;

  plaid: Plaid | null = null;

  store: StoreInterface;

  constructor(store: StoreInterface) {
    makeAutoObservable(this);

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
