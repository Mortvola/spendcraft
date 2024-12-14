import React from 'react';
import { FormField, FormModal } from '@mortvola/forms';
import { ModalProps, makeUseModal } from '@mortvola/usemodal';
import {
  FieldArray, FieldArrayRenderProps, FormikErrors, useField,
} from 'formik';
import { observer } from 'mobx-react-lite';
import { AutoAssignmentInterface, CategoryInterface } from '../State/Types';
import CategoryInput from '../CategoryInput/CategoryInput';
import { useStores } from '../State/Store';
import styles from './AutoAssignmentDialog.module.scss'
import IconButton from '../IconButton';
import CategorySpread from '../CategorySpread/CategorySpread';

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
  const { autoAssignments, categoryTree: { unassignedCat } } = useStores();

  if (!unassignedCat) {
    throw new Error('Unassigned is not defined or null')
  }

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
        id: -1, categoryId: unassignedCat.id, amount: 100, percentage: true,
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
                  (arrayHelpers: FieldArrayRenderProps) => (
                    formikProps.values.searchStrings.map((s, i) => (
                      // eslint-disable-next-line react/no-array-index-key
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

            <CategorySpread
              name="categories"
              categories={formikProps.values.categories}
              title="Categories:"
            />

          </>
        )
      }
    </FormModal>
  )
})

export const useAutoAssignmentDialog = makeUseModal<PropsType>(AutoAssignmentDialog, { size: 'md' });

export default AutoAssignmentDialog;
