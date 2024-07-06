import { makeAutoObservable, runInAction } from 'mobx';
import Category from './Category';
import {
  AccountInterface,
  CategoryInterface,
  FundingPlanInterface,
  StoreInterface, TransactionInterface, UIStateInterface,
} from './Types';
import Plaid from './Plaid';

class UIState implements UIStateInterface {
  selectedCategory: CategoryInterface | null = null;

  selectedPlan: FundingPlanInterface | null = null;

  selectedAccount: AccountInterface | null = null;

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
