import React from 'react';
import { FormField, FormModal } from '@mortvola/forms';
import { ModalProps, makeUseModal } from '@mortvola/usemodal';
import { FieldArray, FormikErrors, useField } from 'formik';
import { Button } from 'react-bootstrap';
import { observer } from 'mobx-react-lite';
import { AutoAssignmentInterface, CategoryInterface } from '../State/State';
import AmountInput from '../AmountInput';
import CategoryInput from '../CategoryInput/CategoryInput';
import { useStores } from '../State/mobxStore';
import styles from './AutoAssignmentDialog.module.scss'
import IconButton from '../IconButton';

let tempId = -1;

const nextTempid = () => {
  const id = tempId;
  tempId -= 1;

  return id;
}

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
  autoAssignment?: AutoAssignmentInterface
}

const AutoAssignmentDialog: React.FC<PropsType & ModalProps> = observer(({
  setShow,
  autoAssignment,
}) => {
  const { autoAssignments } = useStores();

  type ValueType = {
    name: string,
    searchStrings: string[],
    categories: { id: number, categoryId: number, amount: number, percentage: boolean }[],
  }

  const handleValidate = (values: ValueType) => {
    const errors: FormikErrors<ValueType> = {};

    return errors;
  }

  const handleSubmit = async (values: ValueType) => {
    if (autoAssignment) {
      await autoAssignment.update({
        name: values.name,
        searchStrings: values.searchStrings,
        categories: values.categories,
      })
    }
    else {
      await autoAssignments.add({
        name: values.name,
        searchStrings: values.searchStrings,
        categories: values.categories,
      })
    }

    setShow(false)
  }

  const handleDelete = async () => {
    if (autoAssignment) {
      await autoAssignment.delete();
    }

    setShow(false)
  }

  const initialCategories = (categories?: { id: number, categoryId: number, amount: number, percentage: boolean}[]) => {
    if (!categories || categories.length === 0) {
      return [{
        id: -1, categoryId: -1, amount: 0, percentage: true,
      }]
    }
    return categories.map((c) => ({
      id: c.id, categoryId: c.categoryId, amount: c.amount, percentage: c.percentage,
    }))
  }

  return (
    <FormModal<ValueType>
      initialValues={{
        name: autoAssignment?.name ?? '',
        searchStrings: (autoAssignment?.searchStrings ?? [''])
          .map((s) => (s)),
        categories: initialCategories(autoAssignment?.categories),
      }}
      title={autoAssignment ? 'Edit Auto Assignment' : 'Add Auto Assignment'}
      setShow={setShow}
      validate={handleValidate}
      onSubmit={handleSubmit}
      onDelete={autoAssignment ? handleDelete : undefined}
    >
      {
        (formikProps) => (
          <>
            <FormField name="name" label="Name" />
            <label className={styles.searchStrings}>
              Search Strings
              <FieldArray
                name="searchStrings"
              >
                {
                  (arrayHelpers) => (
                    formikProps.values.searchStrings.map((s, i) => (
                      <div key={i} className={styles.searchStringLayout}>
                        <FormField name={`searchStrings[${i}]`} style={{ marginTop: 0 }} />
                        <IconButton
                          icon="plus"
                          onClick={
                            () => arrayHelpers.insert(i + 1, '')
                          }
                        />
                        <IconButton
                          icon="minus"
                          onClick={
                            () => {
                              if (formikProps.values.searchStrings.length > 1) {
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

            <label className={styles.categoriesLayout}>
              Categories
              <FieldArray
                name="categories"
              >
                {
                  (arrayHelpers) => (
                    formikProps.values.categories.map((c, i) => (
                      <div key={c.id} className={styles.categoryLayout}>
                        <FormField
                          name={`categories[${i}].categoryId`}
                          as={FormCategoryInput}
                          style={{ marginTop: 0 }}
                        />
                        <FormField as={AmountInput} name={`categories[${i}].amount`} style={{ marginTop: 0 }} />
                        <IconButton
                          icon="plus"
                          onClick={() => arrayHelpers.insert(
                            i + 1,
                            {
                              id: -1, categoryId: -1, amount: 0, percentage: true,
                            },
                          )}
                        />
                        <IconButton
                          icon="minus"
                          onClick={
                            () => {
                              if (formikProps.values.categories.length > 1) {
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
          </>
        )
      }
    </FormModal>
  )
})

export const useAutoAssignmentDialog = makeUseModal<PropsType>(AutoAssignmentDialog, { size: 'md' });

export default AutoAssignmentDialog;
