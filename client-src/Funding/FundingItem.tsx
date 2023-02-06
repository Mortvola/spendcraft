import React from 'react';
import { DateTime } from 'luxon';
import AmountInput from '../AmountInput';
import Amount from '../Amount';
import styles from './Funding.module.css'
import { FundingInfoType } from './Types';
import VerticalTitled from './VerticalTitled';

type PropsType = {
  fundingInfo?: FundingInfoType,
  name: string,
  funding: number,
  date: DateTime,
  onDeltaChange: ((amount: number, delta: number) => void),
}

const FundingItem: React.FC<PropsType> = ({
  fundingInfo,
  name,
  funding,
  date,
  onDeltaChange,
}) => {
  const balance = (fundingInfo?.initialAmount ?? 0) + funding;

  const previousMonthName = date.minus({ months: 1 }).monthLong;

  return (
    <div className={styles.fundListItem}>
      <div className={styles.fundListCatName}>{name}</div>
      <div className={styles.valuesWrapper}>
        <div className={styles.fundValues}>
          <VerticalTitled title="Current">
            <Amount amount={fundingInfo?.initialAmount ?? 0} />
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
            {`${previousMonthName} Expenses:`}
            <Amount style={{ minWidth: '6rem' }} amount={fundingInfo?.previousExpenses ?? 0} />
          </div>
          <div className={styles.labeledAmount}>
            {`${previousMonthName} Funding:`}
            <Amount style={{ minWidth: '6rem' }} amount={fundingInfo?.previousFunding ?? 0} />
          </div>
          <div className={styles.labeledAmount}>
            {`${previousMonthName} Category Transfers:`}
            <Amount style={{ minWidth: '6rem' }} amount={fundingInfo?.previousCatTransfers ?? 0} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default FundingItem;
