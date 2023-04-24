import React from 'react';
import { DateTime } from 'luxon';
import { Field, FieldProps, useField } from 'formik';
import AmountInput from '../AmountInput';
import Amount from '../Amount';
import styles from './Funding.module.css'
import { FundingInfoType } from './Types';
import VerticalTitled from './VerticalTitled';
import { CategoryInterface } from '../State/State';

type PropsType = {
  fundingInfo?: FundingInfoType,
  category: CategoryInterface,
  date: DateTime,
  onDeltaChange?: (amount: number, delta: number) => void,
}

const FundingItem: React.FC<PropsType> = ({
  fundingInfo,
  category,
  date,
  onDeltaChange,
}) => {
  const name = `categories.${category.id}`;
  const [field] = useField(name);
  const balance = (fundingInfo?.initialAmount ?? 0) + (
    typeof field.value === 'string'
      ? parseFloat(field.value)
      : field.value
  );

  const previousMonthName = date.minus({ months: 1 }).monthLong;

  return (
    <div className={styles.fundListItem}>
      <div className={styles.fundListCatName}>{category.name}</div>
      <div className={styles.valuesWrapper}>
        <div className={styles.fundValues}>
          <VerticalTitled title="Current">
            <Amount amount={fundingInfo?.initialAmount ?? 0} />
          </VerticalTitled>
          <VerticalTitled title="Funding" underscored={false}>
            <Field
              name={name}
            >
              {
                ({ field: fieldProps }: FieldProps) => (
                  <AmountInput onDeltaChange={onDeltaChange} {...fieldProps} />
                )
              }
            </Field>
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
