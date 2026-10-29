import React from 'react';
import { FormField, FormModal } from '@mortvola/forms';
import { ModalProps, makeUseModal } from '@mortvola/usemodal';
import {
  FieldArray, FieldArrayRenderProps, FormikErrors,
} from 'formik';
import { observer } from 'mobx-react-lite';
import { Minus, Plus } from 'lucide-react';
import { AutoAssignmentInterface, AutoAssignmentRule } from '../State/Types';
import { useStores } from '../State/Store';
import styles from './AutoAssignmentDialog.module.scss'
import CategorySpread from '../CategorySpread/CategorySpread';
import { formatMoneyCents } from '../../common/moneyCents';
import { inputMoneyCents } from '../monetary';
import LucideButton from '../LucideButton';
import { CategorySpreadInput } from '../Funding/Types';

// let tempId = -1;

// const nextTempid = () => {
//   const id = tempId;
//   tempId -= 1;

//   return id;
// }

// const FormCategoryInput = ({ name }: { name: string }) => {
//   const [field, , helpers] = useField(name);

//   const handleCategoryChange = (category: CategoryInterface) => {
//     helpers.setValue(category.id)
//   }

//   return (
//     <CategoryInput
//       name={name}
//       categoryId={parseInt(field.value, 10)}
//       className="form-control"
//       onCategoryChange={handleCategoryChange}
//     />
//   )
// }

interface PropsType {
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

  interface ValueType {
    name: string,
    searchStrings: string[],
    categories: (CategorySpreadInput & { id: number })[],
  }

  const handleValidate = (values: ValueType) => {
    const errors: FormikErrors<ValueType> = {};
    try {
      for (const rule of values.categories) {
        if (rule.percentage) {
          if (!Number.isFinite(rule.amount)) throw new Error('Invalid percentage');
        } else inputMoneyCents(rule.amount);
      }
    }
    catch { errors.categories = 'Enter valid, safe assignment amounts.'; }
    return errors;
  }

  const handleSubmit = async (values: ValueType) => {
    const categories: AutoAssignmentRule[] = values.categories.map(rule => {
      if (rule.percentage) return rule;
      const { amount, ...metadata } = rule;
      return { ...metadata, amountCents: inputMoneyCents(amount) };
    });
    if (autoAssignment) {
      await autoAssignment.update({
        name: values.name,
        searchStrings: values.searchStrings,
        categories,
      })
    }
    else {
      await autoAssignments.add({
        name: values.name,
        searchStrings: values.searchStrings,
        categories,
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

  const initialCategories = (categories?: AutoAssignmentRule[]): (CategorySpreadInput & { id: number })[] => {
    if (!categories || categories.length === 0) {
      return [{
        id: -1, categoryId: unassignedCat.id, amount: 100, percentage: true,
      }]
    }
    return categories.map(c => c.percentage === true
      ? { id: c.id, categoryId: c.categoryId, amount: c.amount, percentage: true }
      : { id: c.id, categoryId: c.categoryId, amount: formatMoneyCents(c.amountCents), percentage: false })

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
                      <div key={i} className={styles.searchStringLayout}>
                        <FormField name={`searchStrings[${i}]`} style={{ marginTop: 0 }} />
                        <LucideButton
                          onClick={
                            () => arrayHelpers.insert(i + 1, '')
                          }
                        >
                          <Plus size={16} strokeWidth={2.5} />
                        </LucideButton>
                        <LucideButton
                          onClick={
                            () => {
                              if (formikProps.values.searchStrings.length > 1) {
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
