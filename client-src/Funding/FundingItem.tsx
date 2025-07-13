import React from 'react';
import { DateTime } from 'luxon';
import {
  Field, FieldProps, useField,
  useFormikContext,
} from 'formik';
import { FormCheckbox } from '@mortvola/forms';
import AmountInput from '../AmountInput';
import Amount from '../Amount';
import styles from './Funding.module.scss'
import { FundingInfoType, ValueType } from './Types';
import VerticalTitled from './VerticalTitled';
import { CategoryInterface } from '../State/Types';
import CategorySpread from '../CategorySpread/CategorySpread';

interface PropsType {
  fundingInfo?: FundingInfoType,
  groupName: string | null,
  category: CategoryInterface,
  date: DateTime,
  onDeltaChange?: (amount: number, delta: number) => void,
  diffOnly: boolean,
}

const FundingItem: React.FC<PropsType> = ({
  fundingInfo,
  groupName,
  category,
  date,
  onDeltaChange,
  diffOnly,
}) => {
  const { values } = useFormikContext<ValueType>();

  const name = `categories.${category.id}.baseAmount`;
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

  let title = category.name;
  if (groupName) {
    title = `${groupName}: ${title}`;
  }

  return (
    <Field
      name={name}
    >
      {
        ({ field: fieldProps }: FieldProps<string, ValueType>) => (
          <div className={`${styles.fundListItem} ${hide(fieldProps.value, fundingInfo?.previousBaseAmount) ? styles.hide : ''}`}>
            <div className={styles.fundListCatName}>{title}</div>
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
                <div>{`${previousMonthName} Funding:`}</div>
                <Amount style={{ minWidth: '6rem' }} amount={fundingInfo?.previousBaseAmount ?? 0} />
              </div>
              <div className={styles.fundValues2}>
                <div className={styles.labeledAmount}>
                  {`${previousMonthName} Expenses:`}
                  <Amount style={{ minWidth: '6rem' }} amount={fundingInfo?.previousExpenses ?? 0} />
                </div>
                <div className={styles.labeledAmount}>
                  {`${previousMonthName} Category Transfers:`}
                  <Amount style={{ minWidth: '6rem' }} amount={fundingInfo?.previousCatTransfers ?? 0} />
                </div>
              </div>
            </div>

            <div className={styles.fundingWrapper}>
              <FormCheckbox
                name={`categories.${category.id}.includeFundingTransfers`}
                label="Add Funding Transfers to Funding Amount."
              />

              <CategorySpread
                name={`categories.${category.id}.fundingCategories`}
                categories={values.categories[category.id].fundingCategories}
                title="Funding Categories:"
              />
            </div>
          </div>
        )
      }
    </Field>
  );
};

export default FundingItem;
