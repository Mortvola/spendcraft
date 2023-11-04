import React from 'react';
import { observer } from 'mobx-react-lite';
import {
  TransactionContainerInterface,
} from '../State/State';
import PleaseWait from '../PleaseWait';
import styles from './Transactions.module.scss';
import useTrxPager from './TrxPager';

type PropsType = {
  trxContainer: TransactionContainerInterface,
  children?: React.ReactNode,
}

const RegisterTransactions: React.FC<PropsType> = observer(({
  trxContainer,
  children,
}) => {
  const ref = React.useRef<HTMLDivElement>(null);
  const checkForNeededData = useTrxPager(trxContainer);
  const [touchStart, setTouchStart] = React.useState<number>(0);
  const [offset, setOffset] = React.useState<number>(0);
  const [maxReached, setMaxReached] = React.useState<boolean>(false);

  const handleScroll: React.UIEventHandler<HTMLDivElement> = () => {
    checkForNeededData(ref.current);
  }

  React.useEffect(() => {
    checkForNeededData(ref.current);
  }, [checkForNeededData]);

  const handleTouchStart: React.EventHandler<React.TouchEvent<HTMLDivElement>> = (event) => {
    const start = event.touches[0].clientY;
    setTouchStart(start);
  };

  const handleTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    if (!maxReached) {
      let delta = event.changedTouches[0].clientY - touchStart;

      if (delta > 0) {
        const maxPull = 200;
        delta /= 2;

        if (delta > maxPull) {
          delta = maxPull;
          setMaxReached(true);
          setOffset(0);
          trxContainer.getTransactions(0);
        }
        else {
          setOffset(delta);
        }
      }
    }
  }

  const handleTouchEnd: React.EventHandler<React.TouchEvent<HTMLDivElement>> = () => {
    setOffset(0);
    setMaxReached(false);
  };

  if (
    trxContainer.transactions.length === 0 && trxContainer.transactionsQuery.fetching
  ) {
    return <PleaseWait />;
  }

  return (
    <div
      ref={ref}
      className={`${styles.transactions} striped`}
      style={{ transform: `translate(0px, ${offset}px)` }}
      onScroll={handleScroll}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {children}
    </div>
  );
});

export default RegisterTransactions;
