import React from 'react';
import AmountInput from '../AmountInput';
import Amount from '../Amount';
import styles from './Funding.module.css'
import { FundingType } from './Types';
import VerticalTitled from './VerticalTitled';

type PropsType = {
  fundingItem?: FundingType,
  name: string,
  initialAmount: number,
  funding: number,
  onDeltaChange: ((amount: number, delta: number) => void),
}

const FundingItem: React.FC<PropsType> = ({
  fundingItem,
  name,
  initialAmount,
  funding,
  onDeltaChange,
}) => {
  const balance = initialAmount + funding;

  return (
    <div className={styles.fundListItem}>
      <div className={styles.fundListCatName}>{name}</div>
      <div className={styles.valuesWrapper}>
        <div className={styles.fundValues}>
          <VerticalTitled title="Current">
            <Amount amount={initialAmount} />
          </VerticalTitled>
          <VerticalTitled title="Funding" underscored={false}>
            <AmountInput value={funding} onDeltaChange={onDeltaChange} />
          </VerticalTitled>
          <VerticalTitled title="Balance">
            <Amount amount={balance} />
          </VerticalTitled>
        </div>
        <div className={styles.fundValues2}>
          <div className={styles.labeledAmount}>
            Previous Expenses
            <Amount style={{ minWidth: '6rem' }} amount={fundingItem?.previousExpenses ?? 0} />
          </div>
          <div className={styles.labeledAmount}>
            Previous Funding
            <Amount style={{ minWidth: '6rem' }} amount={fundingItem?.previousFunding ?? 0} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default FundingItem;
