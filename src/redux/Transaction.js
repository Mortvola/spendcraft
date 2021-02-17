import { makeAutoObservable } from 'mobx';

class Transaction {
  constructor(store, props) {
    this.store = store;

    this.id = props.id;
    this.amount = props.amount;
    this.date = props.date;
    this.type = props.type;
    this.name = props.name;

    makeAutoObservable(this);
  }

  async updateTransactionCategory(request) {
    const response = await fetch(`/transaction/${this.id}`, {
      method: 'PATCH',
      headers:
      {
        'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]').getAttribute('content'),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    const body = await response.json();
    const { splits, categories } = body;

    this.store.categoryTree.updateBalances(categories);
    this.store.register.updateTransactionCategories(this.id, splits, categories);

    return null;
  }
}

export default Transaction;
