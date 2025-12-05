import { observable, ObservableMap, runInAction } from 'mobx';
import type Category from './Category';
import type {
  AccountInterface,
  CategoryInterface,
  FundingPlanInterface,
  StoreInterface, TransactionInterface, UIStateInterface,
} from './Types';
import type Plaid from './Plaid';
import type Statement from './Statement';

const localStorageGroupState = 'groupState'
const localStorageAccountState = 'accountState'
const localStorageAccountsState = 'accountsState'

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

  @observable
  accessor search = { name: '', amount: '' }

  groupState: ObservableMap

  accountState: ObservableMap

  @observable
  accessor accountsState = true

  @observable
  accessor showHidden = false

  store: StoreInterface;

  constructor(store: StoreInterface) {
    this.store = store;

    this.groupState = observable.map(new Map<number, boolean>())

    this.initializeGroupState()

    this.accountState = observable.map(new Map<number, boolean>())

    this.initializeAccountState()

    this.initializeAccountsState()
  }

  initializeGroupState(): void {
    const data = localStorage.getItem(localStorageGroupState);

    if (data) {
      try {
        const groupState = JSON.parse(data)

        if (groupState) {
          this.groupState.replace(groupState)
        }
      }
      catch (error) {
        console.log(error)
      }
    }
  }

  initializeAccountState(): void {
    const data = localStorage.getItem(localStorageAccountState);

    if (data) {
      try {
        const accountState = JSON.parse(data)

        if (accountState) {
          this.accountState.replace(accountState)
        }
      }
      catch (error) {
        console.log(error)
      }
    }
  }

  initializeAccountsState(): void {
    const data = localStorage.getItem(localStorageAccountsState)

    if (data) {
      try {
        const accountsState = JSON.parse(data)

        if (accountsState !== undefined) {
          this.accountsState = accountsState
        }
      }
      catch (error) {
        console.log(error)
      }
    }
  }

  toggleGroupExpanded(id: number): void {
    runInAction(() => {
      const expanded = this.groupState.get(id) ?? true
      this.groupState.set(id, !expanded)

      const data = JSON.stringify(this.groupState.toJSON())
      localStorage.setItem(localStorageGroupState, data)
    })
  }

  toggleAccountExpanded(id: number): void {
    runInAction(() => {
      const expanded = this.accountState.get(id) ?? true
      this.accountState.set(id, !expanded)

      const data = JSON.stringify(this.accountState.toJSON())
      localStorage.setItem(localStorageAccountState, data)
    })
  }

  toggleAccountsExpanded(): void {
    runInAction(() => {
      this.accountsState = !this.accountsState

      const data = JSON.stringify(this.accountsState)
      localStorage.setItem(localStorageAccountsState, data)
    })
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
