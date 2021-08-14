import React, { useState, useContext, ReactElement } from 'react';
import { observer } from 'mobx-react-lite';
import { Spinner } from 'react-bootstrap';
import Transaction from './Transaction';
import Amount from './Amount';
import MobxStore from './state/mobxStore';
import { AccountInterface, CategoryInterface, TransactionInterface } from './state/State';
import PendingTransaction from './state/PendingTransaction';
import LoanTransaction from './state/LoanTransaction';

type PropsType = {
  isMobile?: boolean;
}

const Register = ({
  isMobile,
}: PropsType): ReactElement => {
  const [selectedTransaction, setSelectedTransaction] = useState<number | null>(null);
  const { uiState } = useContext(MobxStore);
  let transactions: TransactionInterface[] | undefined;
  let pending: PendingTransaction[] | undefined;
  let loan: { balance: number, transactions: LoanTransaction[] } | undefined;
  let balance = 0;
  let fetching = false;

  let category: CategoryInterface | null = null;

  if (uiState.view === 'HOME') {
    category = uiState.selectedCategory;

    if (category) {
      transactions = category.transactions;
      pending = category.pending;
      loan = category.loan;
      balance = category.balance;
      fetching = category.fetching;
    }
  }

  let account: AccountInterface | null = null;
  if (uiState.view === 'ACCOUNTS') {
    account = uiState.selectedAccount;

    if (account) {
      transactions = account.transactions;
      pending = account.pending;
      balance = account.balance;
    }
  }

  const handleClick = (transactionId: number) => {
    setSelectedTransaction(transactionId);
  };

  const renderTransactions = () => {
    if (fetching) {
      return (
        <div className="please-wait">
          <Spinner animation="border" />
        </div>
      );
    }

    let list: ReactElement[] | null = null;

    if (transactions) {
      let runningBalance = balance;
      list = transactions.map((transaction) => {
        let { amount } = transaction;

        if (category !== null) {
          amount = transaction.getAmountForCategory(category.id);
        }

        const selected = selectedTransaction === transaction.id;

        const element = (
          <Transaction
            key={transaction.id}
            transaction={transaction}
            amount={amount}
            balance={runningBalance}
            selected={selected}
            category={uiState.selectedCategory}
            isMobile={isMobile}
          />
        );

        if (runningBalance !== undefined) {
          runningBalance -= amount;
        }

        return element;
      });
    }

    return (
      <div className="transactions">
        {list}
      </div>
    );
  };

  const renderLoanTransactions = () => {
    let list: ReactElement[] | null = null;

    if (loan) {
      let runningBalance = loan.balance;
      list = loan.transactions.map((transaction) => {
        const { principle } = transaction;
        const { interest } = transaction;

        // if (category !== null) {
        //   amount = transaction.getAmountForCategory(category.id);
        // }

        // const selected = selectedTransaction === transaction.id;

        const element = (
          <div key={transaction.id} className="loan-transaction">
            <div />
            <div>{transaction.date}</div>
            <div className="transaction-field">{transaction.name}</div>
            <Amount amount={principle} />
            <Amount amount={interest} />
            <Amount amount={runningBalance} />
          </div>
        );

        if (runningBalance !== undefined) {
          runningBalance -= principle;
        }

        return element;
      });

      return (
        <div className="register">
          <div className="pending-register-title">
            Loan Transactions:
          </div>
          <div className="register-title loan-transaction">
            <div />
            <div>Date</div>
            <div>Name</div>
            <div className="currency">Principle</div>
            <div className="currency">Interest</div>
            <div className="currency">Balance</div>
            <div />
          </div>
          <div className="transactions striped">
            {list}
          </div>
        </div>
      );
    }

    return null;
  };

  const renderPendingTransactions = () => {
    if (pending) {
      return pending.map((transaction) => (
        <div key={transaction.id} className="pending-transaction striped">
          <div />
          <div>{transaction.date}</div>
          <div className="transaction-field">{transaction.name}</div>
          <Amount amount={transaction.amount} />
        </div>
      ));
    }

    return null;
  };

  const renderPending = () => {
    if (!fetching && pending && pending.length > 0) {
      return (
        <div className="register">
          <div className="pending-register-title">
            Pending Transactions:
          </div>
          <div className="register-title pending-transaction">
            <div />
            <div>Date</div>
            <div>Name</div>
            <div className="currency">Amount</div>
            <div />
            <div />
          </div>
          <div className="transactions striped">
            {renderPendingTransactions()}
          </div>
        </div>
      );
    }

    return null;
  };

  const renderColumnTitles = () => {
    if (category === null) {
      return (
        <div className="register-title acct-transaction">
          <div />
          <div>Date</div>
          <div>Name</div>
          <div>Category</div>
          <div className="currency">Amount</div>
          <div className="currency">Balance</div>
        </div>
      );
    }

    return (
      <div className="register-title transaction">
        <div />
        <div>Date</div>
        <div>Name</div>
        <div>Category</div>
        <div className="currency">Amount</div>
        <div className="currency">Balance</div>
        <div>Institution</div>
        <div>Account</div>
      </div>
    );
  };

  if (isMobile) {
    return renderTransactions();
  }

  return (
    <div className="register-dual-pane">
      <div className="register">
        <div />
        {renderColumnTitles()}
        {renderTransactions()}
      </div>
      {
        category && category.type === 'LOAN'
          ? renderLoanTransactions()
          : renderPending()
      }
    </div>
  );
};

Register.defaultProps = {
  isMobile: false,
};

export default observer(Register);
