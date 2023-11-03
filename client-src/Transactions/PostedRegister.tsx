import React from 'react';
import { observer } from 'mobx-react-lite';
import useMediaQuery from '../MediaQuery';
import RegisterTransactions from './RegisterTransactions';
import {
  AccountInterface, CategoryInterface, TransactionContainerInterface, TransactionInterface,
} from '../State/State';
import RegisterTitles from './RegisterTitles';
import useTrxDialog from './TrxDialog';
import TransactionBase from './Transactions/TransactionBase';
import RebalancesTitles from './RebalancesTitles';
import RebalanceTransaction from './Transactions/RebalanceTransaction';
import styles from './Transactions.module.scss';
import Transaction from './Transactions/Transaction';

type PropsType = {
  type: 'category' | 'account' | 'rebalances',
  trxContainer: TransactionContainerInterface,
  category: CategoryInterface | null,
  account: AccountInterface | null,
  transactionClassName?: string,
}

const PostedRegister: React.FC<PropsType> = observer(({
  type,
  trxContainer,
  category,
  account,
  transactionClassName,
}) => {
  const { isMobile } = useMediaQuery();

  const [TrxDialog, showTrxDialog] = useTrxDialog(account ?? undefined);

  let titles = (
    <RegisterTitles
      category={category}
      account={account}
      transactionClassName={transactionClassName}
    />
  );

  let renderTransactions = () => {
    if (trxContainer === null) {
      throw new Error('trxContainer is not set');
    }

    let runningBalance = trxContainer.balance;

    return trxContainer.transactions.map((transaction) => {
      let { amount } = transaction;
      if (category !== null) {
        amount = transaction.getAmountForCategory(category.id);
      }
      else if (account && account.type === 'loan') {
        amount = transaction.principle ?? 0;
      }

      const element = (
        <TransactionBase
          key={transaction.id}
          transaction={transaction}
          showTrxDialog={showTrxDialog}
          className={transactionClassName}
        >
          <Transaction
            transaction={transaction}
            amount={amount}
            runningBalance={runningBalance}
            account={account}
          />
        </TransactionBase>
      )

      if (runningBalance !== undefined) {
        runningBalance -= amount;
      }

      return element;
    });
  }

  if (type === 'rebalances') {
    titles = <RebalancesTitles />;

    renderTransactions = () => {
      if (trxContainer === null) {
        throw new Error('trxContainer is not set');
      }

      return trxContainer.transactions.map((transaction) => {
        const amount = transaction.categories.reduce((prev, c) => {
          if (c.amount > 0) {
            return prev + c.amount;
          }

          return prev;
        }, 0);

        return (
          <TransactionBase
            key={transaction.id}
            transaction={transaction}
            showTrxDialog={showTrxDialog}
            className={styles.rebalances}
          >
            <RebalanceTransaction
              amount={amount}
            />
          </TransactionBase>
        );
      })
    };
  }

  return (
    <div className="register window window1">
      <div />
      {
        isMobile
          ? null
          : titles
      }
      <RegisterTransactions trxContainer={trxContainer}>
        { renderTransactions() }
      </RegisterTransactions>
      <TrxDialog />
    </div>
  );
});

export default PostedRegister;
