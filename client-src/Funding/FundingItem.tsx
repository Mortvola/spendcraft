import React from 'react';
import { DateTime } from 'luxon';
import { Field, FieldProps, useField } from 'formik';
import AmountInput from '../AmountInput';
import Amount from '../Amount';
import styles from './Funding.module.scss'
import { FundingInfoType } from './Types';
import VerticalTitled from './VerticalTitled';
import { CategoryInterface } from '../State/State';

type PropsType = {
  fundingInfo?: FundingInfoType,
  category: CategoryInterface,
  date: DateTime,
  onDeltaChange?: (amount: number, delta: number) => void,
  diffOnly: boolean,
}

const FundingItem: React.FC<PropsType> = ({
  fundingInfo,
  category,
  date,
  onDeltaChange,
  diffOnly,
}) => {
  const name = `categories.${category.id}`;
  const [field] = useField(name);
  const balance = (fundingInfo?.initialAmount ?? 0) + (
    typeof field.value === 'string'
      ? parseFloat(field.value ?? 0)
      : (field.value ?? 0)
  );

  const previousMonthName = date.minus({ months: 1 }).monthLong;

  const hide = (current: string, previous?: number) => {
    const value1 = parseFloat(current ?? 0).toFixed(2);
    const value2 = (previous ?? 0).toFixed(2);

    return diffOnly && !(value1 !== value2);
  }

  return (
    <Field
      name={name}
    >
      {
        ({ field: fieldProps }: FieldProps) => (
          <div className={`${styles.fundListItem} ${hide(fieldProps.value, fundingInfo?.previousFunding) ? styles.hide : ''}`}>
            <div className={styles.fundListCatName}>{category.name}</div>
            <div className={styles.valuesWrapper}>
              <div className={styles.fundValues}>
                <VerticalTitled title="Current">
                  <Amount amount={fundingInfo?.initialAmount ?? 0} />
                </VerticalTitled>
                <VerticalTitled title="Funding" underscored={false}>
                  <AmountInput onDeltaChange={onDeltaChange} {...fieldProps} />
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
        )
      }
    </Field>
  );
};

export default FundingItem;
