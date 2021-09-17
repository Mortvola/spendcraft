import { makeAutoObservable, runInAction } from 'mobx';
import Category from './Category';
import {
  AccountInterface,
  CategoryInterface,
  FundingPlanInterface,
  StoreInterface, TransactionInterface, UIStateInterface, Views,
} from './State';

class UIState implements UIStateInterface {
  view: Views = 'HOME';

  selectedCategory: CategoryInterface | null = null;

  selectedPlan: FundingPlanInterface | null = null;

  selectedAccount: AccountInterface | null = null;

  selectedTransaction: TransactionInterface | null = null;

  store: StoreInterface;

  constructor(store: StoreInterface) {
    makeAutoObservable(this);

    this.store = store;
  }

  setView(view: Views): void {
    runInAction(() => {
      if (view === 'HOME' && this.view === 'HOME') {
        this.selectedCategory = this.store.categoryTree.unassignedCat;
      }
      else {
        this.view = view;
      }
    });
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
