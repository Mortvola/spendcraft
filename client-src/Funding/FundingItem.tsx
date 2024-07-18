import React from 'react';
import { DateTime } from 'luxon';
import {
  Field, FieldArray, FieldArrayRenderProps, FieldProps, useField,
  useFormikContext,
} from 'formik';
import { FormField } from '@mortvola/forms';
import AmountInput from '../AmountInput';
import Amount from '../Amount';
import styles from './Funding.module.scss'
import { FundingInfoType, ValueType } from './Types';
import VerticalTitled from './VerticalTitled';
import { CategoryInterface } from '../State/Types';
import CategoryInput from '../CategoryInput/CategoryInput';
import IconButton from '../IconButton';
import { useStores } from '../State/Store';

const FormCategoryInput = ({ name }: { name: string }) => {
  const [field, , helpers] = useField(name);

  const handleCategoryChange = (category: CategoryInterface) => {
    helpers.setValue(category.id)
  }

  return (
    <CategoryInput
      name={name}
      categoryId={parseInt(field.value, 10)}
      className="form-control"
      onCategoryChange={handleCategoryChange}
    />
  )
}

type PropsType = {
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
  const { categoryTree: { fundingPoolCat } } = useStores();

  const { values } = useFormikContext<ValueType>();

  const name = `categories.${category.id}.amount`;
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
          <div className={`${styles.fundListItem} ${hide(fieldProps.value, fundingInfo?.previousFunding) ? styles.hide : ''}`}>
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
                <Amount style={{ minWidth: '6rem' }} amount={fundingInfo?.previousFunding ?? 0} />
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

              <label className={styles.categoriesLayout}>
                Funding Categories:
                <FieldArray
                  name={`categories.${category.id}.fundingCategories`}
                >
                  {
                    (arrayHelpers: FieldArrayRenderProps) => (
                      values.categories[category.id].fundingCategories.map((c, i) => (
                        <div key={c.categoryId} className={styles.categoryLayout}>
                          <FormField
                            name={`${arrayHelpers.name}[${i}].categoryId`}
                            as={FormCategoryInput}
                            style={{ marginTop: 0 }}
                          />
                          <FormField as={AmountInput} name={`${arrayHelpers.name}[${i}].amount`} style={{ marginTop: 0 }} />
                          <IconButton
                            icon="plus"
                            onClick={() => arrayHelpers.insert(
                              i + 1,
                              {
                                id: -1, categoryId: fundingPoolCat!.id, amount: 0, percentage: true,
                              },
                            )}
                          />
                          <IconButton
                            icon="minus"
                            onClick={
                              () => {
                                if (values.categories[category.id].fundingCategories.length > 1) {
                                  arrayHelpers.remove(i)
                                }
                              }
                            }
                          />
                        </div>
                      ))
                    )
                  }
                </FieldArray>
              </label>

            </div>
          </div>
        )
      }
    </Field>
  );
};

export default FundingItem;
