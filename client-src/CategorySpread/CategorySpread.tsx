import React from 'react';
import {
  Field, FieldArray, FieldProps, useField,
} from 'formik';
import { FormField } from '@mortvola/forms';
import { Button } from 'react-bootstrap';
import { Minus, Plus } from 'lucide-react';
import styles from './CategorySpread.module.scss';
import CategoryInput from '../CategoryInput/CategoryInput';
import AmountInput from '../AmountInput';
import { CategoryInterface } from '../State/Types';
import { useStores } from '../State/Store';
import { CategoryType } from '../../common/ResponseTypes';
import LucideButton from '../LucideButton';
import { formatMoneyCents } from '../../common/moneyCents';
import { inputMoneyCents } from '../monetary';

const FormCategoryInput = ({ name, types }: { name: string, types?: CategoryType[] }) => {
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
      types={types}
    />
  )
}

export interface CategorySpreadEntry {
  id?: number,
  categoryId: number,
  amount: number,
  percentage: boolean,
  // fundedAmount?: number,
}

export type CategorySpreadInput = Omit<CategorySpreadEntry, 'amount'> & { amount: number | string };

interface PropsType {
  name: string,
  categories: CategorySpreadInput[],
  centAmounts?: boolean,
  title: string,
  types?: CategoryType[]
}

const CategorySpread: React.FC<PropsType> = ({
  name,
  categories,
  centAmounts = false,  title,
  types,
}) => {
  const { categoryTree: { unassignedCat } } = useStores();

  if (!unassignedCat) {
    throw new Error('unassignedCat is not set')
  }

  return (
    <label className={styles.categoriesLayout}>
      {title}
      <FieldArray
        name={name}
      >
        {
          (arrayHelpers) => (
            categories.map((c, i) => (
              <div key={i} className={styles.categoryLayout}>
                <Field
                  name={`${name}[${i}].categoryId`}
                  as={FormCategoryInput}
                  style={{ marginTop: 0 }}
                  types={types}
                />
                <FormField name={`${name}[${i}].amount`}>
                  {({ field }: FieldProps<string | number>) => (
                    <AmountInput {...field} exactCents={centAmounts && !c.percentage} style={{ marginTop: 0 }} />
                  )}
                </FormField>
                <Field name={`${name}[${i}].percentage`}>
                  {
                    ({ field, form }: FieldProps<boolean>) => (
                      <Button
                        {...field}
                        value={field.value.toString()}
                        className={styles.categoryPercentageToggle}
                        onClick={() => {
                          if (!centAmounts) {
                            form.setFieldValue(field.name, !field.value);
                            return;
                          }
                          const percentage = !field.value;
                          let amount: string | number = c.amount;
                          if (percentage) {
                            const numeric = Number(amount);
                            if (Number.isFinite(numeric)) amount = numeric;
                          } else {
                            try { amount = formatMoneyCents(inputMoneyCents(amount)); }
                            catch { amount = String(amount); }
                          }
                          form.setFieldValue(`${name}[${i}]`, { ...c, amount, percentage });
                        }}
                      >
                        {
                          field.value === true
                            ? '%'
                            : '$'
                        }
                      </Button>
                    )
                  }
                </Field>
                <LucideButton
                  onClick={() => arrayHelpers.insert(
                    i + 1,
                    {
                      id: -1, categoryId: unassignedCat.id, amount: 0, percentage: true,
                    },
                  )}
                >
                  <Plus size={16} strokeWidth={2.5} />
                </LucideButton>
                <LucideButton
                  onClick={
                    () => {
                      if (categories.length > 1) {
                        arrayHelpers.remove(i)
                      }
                    }
                  }
                >
                  <Minus size={16} strokeWidth={2.5} />
                </LucideButton>
              </div>
            ))
          )
        }
      </FieldArray>
    </label>
  )
}

export default CategorySpread;
