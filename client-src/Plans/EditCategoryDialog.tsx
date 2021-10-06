import React, { ReactElement, useContext, useState } from 'react';
import { makeUseModal, ModalProps } from '@mortvola/usemodal';
import {
  FieldProps, FormikErrors,
} from 'formik';
import { runInAction } from 'mobx';
import { CategoryInterface, FundingPlanInterface } from '../State/State';
import FormField from '../Modal/FormField';
import FormRadio from '../Modal/FormRadio';
import styles from './EditCategoryDialog.module.css';
import FundingPlanCategory from '../State/FundingPlanCategory';
import Amount from '../Amount';
import AmountInput from '../AmountInput';
import FormModal from '../Modal/FormModal';
import Http from '@mortvola/http';
import { isFundingPlanCategoryProps } from '../../common/ResponseTypes';
import MobxStore from '../State/mobxStore';

type PropsType = {
  plan: FundingPlanInterface | null,
  category?: CategoryInterface,
  planCategory?: FundingPlanCategory,
}

const EditCategoryDialog = ({
  plan,
  category,
  planCategory,
  setShow,
}: PropsType & ModalProps): ReactElement | null => {
  const { plans: { details } } = useContext(MobxStore);
  const [monthlyFundingAmount, setMonthlyFundingAmount] = useState<number>(
    planCategory && category
      ? FundingPlanCategory
        .computeMonthlyAmount(
          category, planCategory.amount, FundingPlanCategory.computeMonths(planCategory.goalDate.toISODate()),
        )
      : 0,
  );
  const [months, setMonths] = useState<number>(
    FundingPlanCategory.computeMonths(planCategory ? planCategory.goalDate.toISODate() : null),
  );

  type FormValues = {
    name: string,
    amount: string,
    goalAmount: string,
    goalDate: string,
    recurrence: string,
    useGoal: 'goal' | 'monthly',
  };

  if (plan && category && planCategory) {
    const handleDateChange = (
      event: React.ChangeEvent<HTMLInputElement>,
      fieldProps: FieldProps<string, FormValues>,
    ) => {
      const monthsToGoal = FundingPlanCategory.computeMonths(event.target.value);
      setMonths(monthsToGoal);

      const monthlyAmount = FundingPlanCategory.computeMonthlyAmount(
        category,
        parseFloat(fieldProps.form.values.goalAmount),
        monthsToGoal,
      );
      setMonthlyFundingAmount(monthlyAmount);
    }

    const handleAmountChange = (
      event: React.ChangeEvent<HTMLInputElement>,
    ) => {
      const monthlyAmount = FundingPlanCategory.computeMonthlyAmount(
        category,
        parseFloat(event.target.value),
        months,
      );
      setMonthlyFundingAmount(monthlyAmount);
    }

    const handleSubmit = async (values: FormValues) => {
      const response = await Http.put(`/api/funding-plans/${plan.id}/item/${category.id}`, {
        amount: values.useGoal === 'goal' ? values.goalAmount : values.amount,
        useGoal: values.useGoal === 'goal',
        goalDate: values.goalDate,
        recurrence: values.recurrence,
      });

      if (response.ok) {
        const body = await response.body();
        if (isFundingPlanCategoryProps(body)) {
          runInAction(() => {
            if (details === null) {
              throw new Error('details is null');
            }

            const index = details.categories.findIndex((pc) => pc.categoryId === category.id)

            details.categories[index] = new FundingPlanCategory(body);
          });
        }

        setShow(false);
      }
    }

    const handleValidate = (values: FormValues): FormikErrors<FormValues> => {
      const errors: FormikErrors<FormValues> = {};

      return errors;
    }

    return (
      <FormModal<FormValues>
        initialValues={{
          name: category.name,
          amount: planCategory.amount.toString(),
          goalAmount: planCategory.amount.toString(),
          goalDate: FundingPlanCategory.sanitizeGoalDate(planCategory.goalDate.toISODate()),
          recurrence: planCategory.recurrence.toString(),
          useGoal: planCategory.useGoal ? 'goal' : 'monthly',
        }}
        title="Edit Plan Category"
        onSubmit={handleSubmit}
        validate={handleValidate}
        setShow={setShow}
      >
        <div className={styles.form}>
          <div>
            <FormField name="name" label="Category" />
            <div className={styles.balance}>
              {`Current balance: ${category ? category.balance : 0}`}
            </div>
          </div>
          <div className={styles.controls}>
            <FormRadio
              name="useGoal"
              label="Use a monthly funding amount."
              value="monthly"
            >
              <div className={styles.goalControls}>
                <FormField
                  name="amount"
                  label="Monthly Funding Amount"
                  as={AmountInput}
                />
              </div>
            </FormRadio>
            <FormRadio
              name="useGoal"
              label="Calculate a monthly funding amount from a goal."
              value="goal"
            >
              <div className={styles.goalControls}>
                <FormField
                  name="goalAmount"
                  label="Goal Amount"
                  onChange={handleAmountChange}
                  as={AmountInput}
                />
                <div>
                  <FormField
                    name="goalDate"
                    label="Goal Date"
                    type="date"
                    onChange={handleDateChange}
                  />
                  <div className={styles.goalDateDescription}>
                    {`${months} months from now.`}
                  </div>
                </div>
                <label className={styles.monthlyAmount}>
                  Monthly Funding Amount
                  <Amount amount={monthlyFundingAmount} />
                </label>
                <FormField
                  name="recurrence"
                  label="Recurrence (in months)"
                />
              </div>
            </FormRadio>
          </div>
        </div>
      </FormModal>
    )
  }

  return null;
}

export const useEditCategoryDialog = makeUseModal(EditCategoryDialog);
export default EditCategoryDialog;
