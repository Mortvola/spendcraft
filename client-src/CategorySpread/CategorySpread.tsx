import React from 'react';
import {
  Field, FieldArray, FieldProps, useField,
} from 'formik';
import { FormField } from '@mortvola/forms';
import { Button } from 'react-bootstrap';
import styles from './CategorySpread.module.scss';
import CategoryInput from '../CategoryInput/CategoryInput';
import AmountInput from '../AmountInput';
import { CategoryInterface } from '../State/Types';
import IconButton from '../IconButton';
import { useStores } from '../State/Store';
import { CategoryType } from '../../common/ResponseTypes';

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

export type CategorySpreadEntry = {
  id?: number,
  categoryId: number,
  amount: number,
  percentage: boolean,
  // fundedAmount?: number,
};

type PropsType = {
  name: string,
  categories: CategorySpreadEntry[],
  title: string,
  types?: CategoryType[]
}

const CategorySpread: React.FC<PropsType> = ({
  name,
  categories,
  title,
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
              // eslint-disable-next-line react/no-array-index-key
              <div key={i} className={styles.categoryLayout}>
                <Field
                  name={`${name}[${i}].categoryId`}
                  as={FormCategoryInput}
                  style={{ marginTop: 0 }}
                  types={types}
                />
                <FormField as={AmountInput} name={`${name}[${i}].amount`} style={{ marginTop: 0 }} />
                <Field name={`${name}[${i}].percentage`}>
                  {
                    ({ field, form }: FieldProps<boolean>) => (
                      <Button
                        {...field}
                        value={field.value.toString()}
                        className={styles.categoryPercentageToggle}
                        onClick={() => (
                          field.value === true
                            ? form.setFieldValue(field.name, false)
                            : form.setFieldValue(field.name, true)
                        )}
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
                <IconButton
                  icon="plus"
                  onClick={() => arrayHelpers.insert(
                    i + 1,
                    {
                      id: -1, categoryId: unassignedCat.id, amount: 0, percentage: true,
                    },
                  )}
                />
                <IconButton
                  icon="minus"
                  onClick={
                    () => {
                      if (categories.length > 1) {
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
  )
}

export default CategorySpread;
