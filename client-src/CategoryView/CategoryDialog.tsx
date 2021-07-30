/* eslint-disable jsx-a11y/label-has-associated-control */
import React, { ReactElement } from 'react';
import {
  Field, ErrorMessage,
  FormikHelpers,
  FormikContextType,
  FormikErrors,
} from 'formik';
import useModal, { ModalProps, useModalType } from '../Modal/useModal';
import Group from '../state/Group';
import Category from '../state/Category';
import FormModal from '../Modal/FormModal';
import FormError from '../Modal/FormError';

type Props = {
  category?: Category | null,
  group: Group,
}

const CategoryDialog = ({
  onHide,
  show,
  category,
  group,
}: Props & ModalProps): ReactElement => {
  type ValueType = {
    name: string,
  }

  const handleSubmit = async (values: ValueType, bag: FormikHelpers<ValueType>) => {
    const { setErrors } = bag;
    let errors = null;

    if (category) {
      errors = await category.update(values.name);
    }
    else {
      errors = await group.addCategory(values.name);
    }

    if (errors && errors.length > 0) {
      // Display the first error
      // TODO: Display all the errors?
      setErrors({ [errors[0].field]: errors[0].message });
    }
    else {
      onHide();
    }
  };

  const handleValidate = (values: ValueType) => {
    const errors: FormikErrors<ValueType> = {};

    if (values.name === '') {
      errors.name = 'The category name must not be blank.';
    }

    return errors;
  };

  const handleDelete = async (bag: FormikContextType<ValueType>) => {
    const { setErrors } = bag;

    if (!category) {
      throw new Error('category is null or undefined');
    }

    const errors = await group.deleteCategory(category.id);

    if (errors && errors.length > 0) {
      setErrors({ [errors[0].field]: errors[0].message });
    }
    else {
      onHide();
    }
  };

  const title = () => {
    if (category) {
      return 'Edit Category';
    }

    return 'Add Category';
  };

  return (
    <FormModal<ValueType>
      show={show}
      onHide={onHide}
      initialValues={{
        name: category && category.name ? category.name : '',
      }}
      validate={handleValidate}
      onSubmit={handleSubmit}
      onDelete={category ? handleDelete : null}
      title={title()}
      formId="catDialogForm"
    >
      <label>
        Category:
        <Field
          type="text"
          className="form-control"
          name="name"
        />
        <FormError name="name" />
      </label>
    </FormModal>
  );
};

CategoryDialog.defaultProps = {
  category: undefined,
};

export const useCategoryDialog = (): useModalType<Props> => useModal<Props>(CategoryDialog);

export default CategoryDialog;
