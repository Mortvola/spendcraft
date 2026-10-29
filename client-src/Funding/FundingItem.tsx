import React from 'react';
import { DateTime } from 'luxon';
import {
  Field, FieldProps,
  useFormikContext,
} from 'formik';
import { FormCheckbox, FormError } from '@mortvola/forms';
import AmountInput from '../AmountInput';
import MoneyCentsAmount from '../MoneyCentsAmount';
import { addMoneyCents, parseMoneyCents, type MoneyCents } from '../../common/moneyCents';
import { inputMoneyCents } from '../monetary';
import styles from './Funding.module.scss'
import { FundingInfoType, ValueType } from './Types';
import VerticalTitled from './VerticalTitled';
import { calculateFunding, fundingCalculationInputs, fundingCategoryEffectCents } from './calculateFunding';
import { useStores } from '../State/Store';
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
  const { categoryTree: { budget: { fundingPoolCat } } } = useStores();
  if (!fundingPoolCat) throw new Error('funding pool is unassigned');
  // Funding edits retain their date, so the month-start snapshot excludes the old record.
  const zero = parseMoneyCents('0.00');
  let balance: MoneyCents | null = null;
  try {
    balance = addMoneyCents(fundingInfo?.initialAmountCents ?? zero,
      fundingCategoryEffectCents(calculateFunding(fundingCalculationInputs(values.categories), fundingPoolCat.id), category.id));
  }
  catch { /* Keep incomplete or unsafe edits visible without displaying a false balance. */ }

  const previousMonthName = date.minus({ months: 1 }).monthLong;

  const hide = (current: string | number, previous: MoneyCents = zero) => {
    try { return diffOnly && inputMoneyCents(current ?? 0) === previous; }
    catch { return false; }
  };

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
          <div className={`${styles.fundListItem} ${hide(fieldProps.value, fundingInfo?.previousBaseAmountCents) ? styles.hide : ''}`}>
            <div className={styles.fundListCatName}>{title}</div>
            <div className={styles.valuesWrapper}>
              <div className={styles.fundValues}>
                <VerticalTitled title="Current">
                  <MoneyCentsAmount amount={fundingInfo?.initialAmountCents ?? zero} />
                </VerticalTitled>
                <VerticalTitled title="Requested" underscored={false}>
                  <AmountInput exactCents onDeltaChange={onDeltaChange} {...fieldProps} />
                  <FormError name={name} />
                </VerticalTitled>
                <VerticalTitled title="Balance">
                  {balance === null ? <div>Invalid amount</div> : <MoneyCentsAmount amount={balance} />}
                </VerticalTitled>
                <div>{`${previousMonthName} Funding:`}</div>
                <MoneyCentsAmount style={{ minWidth: '6rem' }} amount={fundingInfo?.previousBaseAmountCents ?? zero} />
              </div>
              <div className={styles.fundValues2}>
                <div className={styles.labeledAmount}>
                  {`${previousMonthName} Expenses:`}
                  <MoneyCentsAmount style={{ minWidth: '6rem' }} amount={fundingInfo?.previousExpensesCents ?? zero} />
                </div>
                <div className={styles.labeledAmount}>
                  {`${previousMonthName} Category Transfers:`}
                  <MoneyCentsAmount style={{ minWidth: '6rem' }} amount={fundingInfo?.previousCatTransfersCents ?? zero} />
                </div>
              </div>
            </div>

            <div className={styles.fundingWrapper}>
              <FormCheckbox
                name={`categories.${category.id}.includeFundingTransfers`}
                label="Add Funding Transfers to Funding Amount."
              />

              <CategorySpread
                centAmounts
                name={`categories.${category.id}.fundingCategories`}
                categories={values.categories[category.id].fundingCategories}
                title="Funding Categories:"
              />
              <FormError name={`categories.${category.id}.fundingCategories`} />
            </div>
          </div>
        )
      }
    </Field>
  );
};

export default FundingItem;
