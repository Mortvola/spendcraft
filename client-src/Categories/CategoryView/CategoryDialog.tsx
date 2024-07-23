/* eslint-disable jsx-a11y/label-has-associated-control */
import React from 'react';
import {
  Field,
  FormikHelpers,
  FormikContextType,
  FormikErrors,
  FieldProps,
} from 'formik';
import { makeUseModal, ModalProps } from '@mortvola/usemodal';
import {
  FormModal, FormError, setFormErrors, FormField,
  FormCheckbox,
} from '@mortvola/forms';
import { DateTime } from 'luxon';
import { isGroup } from '../../State/Group';
import { useStores } from '../../State/Store';
import { CategoryInterface } from '../../State/Types';
import AmountInput from '../../AmountInput';
import styles from './CategoryDialog.module.scss';
import { CategoryType } from '../../../common/ResponseTypes';
import CategorySpread, { CategorySpreadEntry } from '../../CategorySpread/CategorySpread';

type Props = {
  category?: CategoryInterface | null,
  type?: CategoryType,
}

const CategoryDialog: React.FC<Props & ModalProps> = ({
  setShow,
  category = null,
  type = 'REGULAR',
}) => {
  const { categoryTree } = useStores();
  const { unassignedCat, fundingPoolCat } = categoryTree;

  if (!unassignedCat || !fundingPoolCat) {
    throw new Error('Unassigned is not defined or null')
  }

  const [categoryType, setCategoryType] = React.useState<CategoryType>((category?.type ?? type) ?? 'REGULAR')

  type FormValues = {
    type: CategoryType,
    name: string,
    fundingAmount: string,
    includeFundingTransfers: boolean,
    recurrence: string,
    groupId: string,
    goalDate: string,
    fundingCategories: CategorySpreadEntry[],
  }

  const handleCategoryTypeChange = (newType: CategoryType) => {
    setCategoryType(newType)
  }

  const handleSubmit = async (values: FormValues, bag: FormikHelpers<FormValues>) => {
    const { setErrors } = bag;
    let errors = null;

    const selectedGroup = (categoryTree.nodes.find(
      (g) => isGroup(g) && g.id === parseInt(values.groupId, 10),
    )
      ?? categoryTree.noGroupGroup);

    if (selectedGroup === null || !isGroup(selectedGroup)) {
      throw new Error(`group is not a group: ${selectedGroup}`);
    }

    if (category) {
      errors = await category.update({
        type: values.type,
        name: values.name,
        fundingAmount: parseFloat(values.fundingAmount),
        includeFundingTransfers: values.includeFundingTransfers,
        group: selectedGroup,
        recurrence: parseInt(values.recurrence, 10),
        useGoal: values.type !== 'REGULAR',
        goalDate: DateTime.fromISO(values.goalDate),
        fundingCategories: values.fundingCategories,
      });
    }
    else {
      errors = await selectedGroup.addCategory({
        type: values.type,
        name: values.name,
        fundingAmount: parseFloat(values.fundingAmount),
        includeFundingTransfers: values.includeFundingTransfers,
        group: selectedGroup,
        recurrence: parseInt(values.recurrence, 10),
        useGoal: values.type !== 'REGULAR',
        goalDate: DateTime.fromISO(values.goalDate),
        fundingCategories: values.fundingCategories,
      });
    }

    if (errors) {
      setFormErrors(setErrors, errors);
    }
    else {
      setShow(false);
    }
  };

  const handleValidate = (values: FormValues) => {
    const errors: FormikErrors<FormValues> = {};

    if (values.name === '') {
      errors.name = 'The category name must not be blank.';
    }

    return errors;
  };

  const handleDelete = async (bag: FormikContextType<FormValues>) => {
    const { setErrors } = bag;

    if (!category) {
      throw new Error('category is null or undefined');
    }

    const errors = await category.delete();

    if (errors) {
      setFormErrors(setErrors, errors);
    }
    else {
      setShow(false);
    }
  };

  const title = () => {
    if (category) {
      return 'Edit Category';
    }

    return 'Add Category';
  };

  const populateGroups = () => {
    const options = [];

    if (categoryTree.noGroupGroup !== null) {
      options.push(<option key="nogroup" value={categoryTree.noGroupGroup.id}>No Group</option>);
    }

    return options.concat(
      categoryTree.nodes
        .filter((g) => isGroup(g) && g.type === 'REGULAR')
        .map((g) => (
          <option key={g.id} value={g.id}>{g.name}</option>
        )),
    )
  }

  const categoryTypeClass = () => (
    ['BILL', 'GOAL'].includes(categoryType) ? styles.bill : ''
  )

  const getGoalDate = (goalDate?: DateTime | null, recurrence = 1): string => {
    if (goalDate) {
      let adjustedGoal = goalDate
      const now = DateTime.now().startOf('month');

      const monthDiff = goalDate.startOf('month').diff(now, 'months').months;
      if (monthDiff < 0) {
        const numPeriods = Math.ceil(-monthDiff / recurrence);
        adjustedGoal = goalDate.plus({ months: numPeriods * recurrence })
      }

      return adjustedGoal.toISODate() ?? '';
    }

    return '';
  }

  const initialCategories = (categories?: { id: number, categoryId: number, amount: number, percentage: boolean}[]) => {
    if (!categories || categories.length === 0) {
      return [{
        id: -1, categoryId: fundingPoolCat.id, amount: 100, percentage: true,
      }]
    }
    return categories.map((c) => ({
      id: c.id, categoryId: c.categoryId, amount: c.amount, percentage: c.percentage,
    }))
  }

  return (
    <FormModal<FormValues>
      setShow={setShow}
      initialValues={{
        type: categoryType,
        name: category && category.name ? category.name : '',
        groupId: category?.groupId.toString() ?? '',
        fundingAmount: category?.fundingAmount.toString() ?? '0',
        includeFundingTransfers: category?.includeFundingTransfers ?? true,
        recurrence: category?.recurrence.toString() ?? '1',
        goalDate: getGoalDate(category?.goalDate, category?.recurrence),
        fundingCategories: initialCategories(category?.fundingCategories),
        // monthlyExpenses: category ? category.monthlyExpenses : false,
      }}
      validate={handleValidate}
      onSubmit={handleSubmit}
      onDelete={category ? handleDelete : null}
      title={title()}
      formId="catDialogForm"
    >
      {
        (formikProps) => (
          <div>
            <div className={styles.wrapper}>
              <FormField name="name" label="Name:" />

              <label style={{ marginTop: '8px' }}>
                Group:
                <Field
                  className="form-control"
                  name="groupId"
                >
                  {
                    ({ field, form }: FieldProps<number>) => (
                      <select
                        className="form-control"
                        name={field.name}
                        value={field.value}
                        onChange={(v) => {
                          form.setFieldValue(field.name, v.target.value);
                        }}
                      >
                        {
                          populateGroups()
                        }
                      </select>
                    )
                  }
                </Field>
                <FormError name="group" />
              </label>
            </div>
            <div className={styles.divider} />
            <div className={`${categoryTypeClass()}`}>
              <div className={styles.fundingTitle}>Funding Settings</div>
              <div className={`${styles.layout}`}>
                <label className={styles.type}>
                  Type:
                  <Field
                    className="form-control"
                    name="type"
                  >
                    {
                      ({ field, form }: FieldProps<CategoryType>) => (
                        <select
                          className="form-control"
                          name="type"
                          value={field.value}
                          onChange={(v) => {
                            handleCategoryTypeChange(v.target.value as CategoryType)
                            form.setFieldValue(field.name, v.target.value);
                          }}
                        >
                          <option value="REGULAR">Category</option>
                          <option value="BILL">Bill</option>
                          <option value="GOAL">Goal</option>
                        </select>
                      )
                    }
                  </Field>
                </label>

                <label className={`${styles.amount}`}>
                  Amount:
                  <Field
                    type="text"
                    className="form-control"
                    name="fundingAmount"
                    as={AmountInput}
                  />
                  <FormError name="fundingAmount" />
                </label>
              </div>

              <FormCheckbox name="includeFundingTransfers" label="Add Funding Transfers to Funding Amount." />

              <div className={styles.layout2}>
                <label className={styles.goalDate}>
                  Date Due:
                  <Field
                    type="date"
                    className={`form-control ${styles.date}`}
                    name="goalDate"
                  />
                  <FormError name="goalDate" />
                </label>
                <label className={styles.recurrence}>
                  Recurrence:
                  <Field
                    type="number"
                    min="1"
                    className="form-control"
                    name="recurrence"
                  />
                  <FormError name="recurrence" />
                </label>
              </div>

              <CategorySpread
                name="fundingCategories"
                categories={formikProps.values.fundingCategories}
                title="Categories Funded from:"
              />

            </div>
            {/* <FormCheckbox name="monthlyExpenses" label="Used for monthly expenses" /> */}
          </div>
        )
      }
    </FormModal>
  );
};

export const useCategoryDialog = makeUseModal<Props>(CategoryDialog);

export default CategoryDialog;
