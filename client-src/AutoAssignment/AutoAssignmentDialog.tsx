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
    >
      {
        (formikProps) => (
          <>
            <FormField name="name" label="Name" />
            <label>
              Search Strings
              <FieldArray
                name="searchStrings"
              >
                {
                  (arrayHelpers) => (
                    formikProps.values.searchStrings.map((s, i) => (
                      <div key={i}>
                        <FormField name={`searchStrings[${i}]`} />
                        <Button
                          onClick={
                            () => arrayHelpers.insert(i + 1, '')
                          }
                        >
                          Add
                        </Button>
                        {
                          formikProps.values.searchStrings.length > 1
                            ? <Button onClick={() => arrayHelpers.remove(i)}>Delete</Button>
                            : null
                        }
                      </div>
                    ))
                  )
                }
              </FieldArray>
            </label>
            <label>
              Categories
              <FieldArray
                name="categories"
              >
                {
                  (arrayHelpers) => (
                    formikProps.values.categories.map((c, i) => (
                      <div key={c.id}>
                        <FormField
                          name={`categories[${i}].categoryId`}
                          as={FormCategoryInput}
                        />
                        <FormField as={AmountInput} name={`categories[${i}].amount`} />
                        <Button
                          onClick={
                            () => arrayHelpers.insert(
                              i + 1,
                              {
                                id: -1, categoryId: -1, amount: 0, percentage: true,
                              },
                            )
                          }
                        >
                          Add
                        </Button>
                        {
                          formikProps.values.categories.length > 1
                            ? <Button onClick={() => arrayHelpers.remove(i)}>Delete</Button>
                            : null
                        }
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

export const useAutoAssignmentDialog = makeUseModal<PropsType>(AutoAssignmentDialog, { size: 'lg' });

export default AutoAssignmentDialog;
