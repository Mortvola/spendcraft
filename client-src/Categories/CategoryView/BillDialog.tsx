/* eslint-disable jsx-a11y/label-has-associated-control */
import React from 'react';
import {
  Field,
  FormikHelpers,
  FormikErrors,
  FormikContextType,
  FieldProps,
} from 'formik';
import { makeUseModal, ModalProps } from '@mortvola/usemodal';
import { FormModal, FormError, setFormErrors } from '@mortvola/forms';
import { DateTime } from 'luxon';
import { useStores } from '../../State/Store';
import { CategoryInterface } from '../../State/Types';
import styles from './BillDialog.module.scss';
import AmountInput from '../../AmountInput';
import CategoryInput from '../../CategoryInput/CategoryInput';
import { isGroup } from '../../State/Group';
import { CategoryType, GroupType } from '../../../common/ResponseTypes';

type PropsType = {
  category?: CategoryInterface | null,
}

const BillDialog: React.FC<PropsType & ModalProps> = ({
  setShow,
  category,
}) => {
  const { categoryTree } = useStores();

  interface ValueType {
    payee: string,
    amount: string,
    goalDate: string,
    recurrence: string,
    category: string,
    groupId: string,
  }

  const handleSubmit = async (values: ValueType, formikHelpers: FormikHelpers<ValueType>) => {
    const { setErrors } = formikHelpers;
    let errors = null;

    const selectedGroup = (categoryTree.budget.children.find((g) => g.id === parseInt(values.groupId, 10))
      ?? categoryTree.noGroupGroup);

    if (selectedGroup === null || !isGroup(selectedGroup)) {
      throw new Error('group is not a group');
    }

    if (category) {
      errors = await category.update({
        type: CategoryType.Bill,
        name: values.payee,
        fundingAmount: parseFloat(values.amount),
        goalDate: DateTime.fromISO(values.goalDate),
        recurrence: parseInt(values.recurrence, 10),
        group: selectedGroup,
        useGoal: true,
        fundingCategories: [],
      });
    }
    else {
      errors = await selectedGroup.addCategory({
        type: CategoryType.Bill,
        name: values.payee,
        fundingAmount: parseFloat(values.amount),
        goalDate: DateTime.fromISO(values.goalDate),
        recurrence: parseInt(values.recurrence, 10),
        group: selectedGroup,
        useGoal: true,
        fundingCategories: [],
      });
    }

    if (errors) {
      setFormErrors(setErrors, errors);
    }
    else {
      setShow(false);
    }
  };

  const handleValidate = (values: ValueType) => {
    const errors: FormikErrors<ValueType> = {};

    if (values.payee === '') {
      errors.payee = 'The payee name must not be blank.';
    }

    return errors;
  };

  const handleDelete = async (bag: FormikContextType<ValueType>) => {
    // const { setErrors } = bag;

    // if (group) {
    //   const errors = await group.delete();

    //   if (errors) {
    //     setFormErrors(setErrors, errors);
    //   }
    //   else {
    //     setShow(false);
    //   }
    // }
  };

  const populateGroups = () => {
    const options = [];

    if (categoryTree.noGroupGroup !== null) {
      options.push(<option key="nogroup" value={categoryTree.noGroupGroup.id}>No Group</option>);
    }

    return options.concat(
      categoryTree.budget.children
        .filter((g) => isGroup(g) && g.type === GroupType.Regular)
        .map((g) => (
          <option key={g.id} value={g.id}>{g.name}</option>
        )),
    )
  }

  const title = () => {
    if (category) {
      return 'Edit Bill';
    }

    return 'Add Bill';
  };

  return (
    <FormModal<ValueType>
      setShow={setShow}
      initialValues={{
        payee: category?.name ?? '',
        amount: category?.fundingAmount.toString() ?? '0',
        goalDate: category?.goalDate?.toISODate() ?? '',
        recurrence: category?.recurrence.toString() ?? '1',
        category: '',
        groupId: category?.group!.id ? category.group!.id.toString() : '',
      }}
      title={title()}
      formId="BillDialogForm"
      validate={handleValidate}
      onSubmit={handleSubmit}
      onDelete={category ? handleDelete : null}
    >
      <label className={styles.name}>
        Payee:
        <Field
          type="text"
          className="form-control"
          name="payee"
        />
        <FormError name="payee" />
      </label>
      <div className={styles.layout}>
        <label>
          Amount:
          <Field
            type="text"
            className="form-control"
            name="amount"
            as={AmountInput}
          />
          <FormError name="amount" />
        </label>
        <label>
          Date Due:
          <Field
            type="date"
            className={`form-control ${styles.date}`}
            name="goalDate"
          />
          <FormError name="goalDate" />
        </label>
        <label>
          Recurrence:
          <Field
            type="number"
            min="1"
            className={`${styles.recurrence} form-control`}
            name="recurrence"
          />
          <FormError name="recurrence" />
        </label>
        <label>
          Associated Category:
          <Field
            type="text"
            className="form-control"
            name="association"
            as={CategoryInput}
          />
          <FormError name="association" />
        </label>
        <label style={{ marginTop: '8px' }}>
          Group:
          <Field
            className="form-control"
            name="groupId"
          >
            {
              (fieldProps: FieldProps<number>) => (
                <select
                  className="form-control"
                  name={fieldProps.field.name}
                  value={fieldProps.field.value}
                  onChange={(v) => {
                    fieldProps.form.setFieldValue(fieldProps.field.name, v.target.value);
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
    </FormModal>
  );
};

export const useBillDialog = makeUseModal<PropsType>(BillDialog);

export default BillDialog;
