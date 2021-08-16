import React, { useState, useContext, ReactElement, useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import { Spinner } from 'react-bootstrap';
import Transaction from './Transaction';
import Amount from './Amount';
import MobxStore from './state/mobxStore';
import { AccountInterface, CategoryInterface, TransactionInterface } from './state/State';
import PendingTransaction from './state/PendingTransaction';
import LoanTransaction from './state/LoanTransaction';
import { useTransactionDialog } from './TransactionDialog';
import { useCategoryTransferDialog } from './CategoryTransferDialog';
import { useFundingDialog } from './funding/FundingDialog';
import { useRebalanceDialog } from './rebalance/RebalanceDialog';
import { isTransaction } from './state/Transaction';
import { TransactionType } from '../common/ResponseTypes';

type PropsType = {
  isMobile?: boolean;
}

const Register = ({
  isMobile,
}: PropsType): ReactElement => {
  const [selectedTransaction, setSelectedTransaction] = useState<number | null>(null);
  const { uiState } = useContext(MobxStore);
  const [TransactionDialog, showTransactionDialog] = useTransactionDialog();
  const [CategoryTransferDialog, showCategoryTransferDialog] = useCategoryTransferDialog();
  const [FundingDialog, showFundingDialog] = useFundingDialog();
  const [RebalanceDialog, showRebalanceDialog] = useRebalanceDialog();
  const [editedTransaction, setEditiedTransaction] = useState<TransactionInterface | null>(null);

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

  const TrxDialog = useCallback(() => {
    if (isTransaction(editedTransaction)) {
      const handleDialogHide = () => {
        setEditiedTransaction(null);
      }

      switch (editedTransaction.type) {
        case TransactionType.TRANSFER_TRANSACTION:
          return (
            <CategoryTransferDialog transaction={editedTransaction} onHide={handleDialogHide} />
          );

        case TransactionType.FUNDING_TRANSACTION:
          return (
            <FundingDialog transaction={editedTransaction} onHide={handleDialogHide}  />
          );

        case TransactionType.REBALANCE_TRANSACTION:
          return (
            <RebalanceDialog transaction={editedTransaction} onHide={handleDialogHide}  />
          );

        case TransactionType.REGULAR_TRANSACTION:
        default:
          return (
            <TransactionDialog transaction={editedTransaction} onHide={handleDialogHide} />
          );
      }
    }

    return null;
  }, [editedTransaction, TransactionDialog, RebalanceDialog, FundingDialog, CategoryTransferDialog]);

  const showTrxDialog = (transaction: TransactionInterface) => {
    setEditiedTransaction(transaction);
    switch (transaction.type) {
      case 0:
      case 5:
        showTransactionDialog();
        break;

      case 1:
        showCategoryTransferDialog();
        break;

      case 2:
        showFundingDialog();
        break;

      case 3:
        showRebalanceDialog();
        break;
    }
  };

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
            showTrxDialog={showTrxDialog}
          />
        );

        if (runningBalance !== undefined) {
          runningBalance -= amount;
        }

        return element;
      });
    }

    return (
      <div className="transactions striped">
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
        <div key={transaction.id} className="pending-transaction">
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
      <TrxDialog />
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
