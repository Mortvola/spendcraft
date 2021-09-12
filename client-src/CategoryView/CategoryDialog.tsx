/* eslint-disable jsx-a11y/label-has-associated-control */
import React, { ReactElement, useContext } from 'react';
import {
  Field,
  FormikHelpers,
  FormikContextType,
  FormikErrors,
  FieldProps,
} from 'formik';
import useModal, { ModalProps, UseModalType } from '../Modal/useModal';
import { isGroup } from '../state/Group';
import FormModal from '../Modal/FormModal';
import FormError from '../Modal/FormError';
import MobxStore from '../state/mobxStore';
import { CategoryInterface, GroupInterface } from '../state/State';

type Props = {
  category?: CategoryInterface | null,
  group: GroupInterface,
}

const CategoryDialog = ({
  onHide,
  show,
  setShow,
  category = null,
  group,
}: Props & ModalProps): ReactElement => {
  const { categoryTree } = useContext(MobxStore);

  type ValueType = {
    name: string,
    groupId: string,
  }

  const handleSubmit = async (values: ValueType, bag: FormikHelpers<ValueType>) => {
    const { setErrors } = bag;
    let errors = null;

    const selectedGroup = (categoryTree.nodes.find((g) => g.id === parseInt(values.groupId, 10))
      ?? categoryTree.noGroupGroup);

    if (selectedGroup === null || !isGroup(selectedGroup)) {
      throw new Error('group is not a group');
    }

    if (category) {
      errors = await category.update(values.name, selectedGroup);
    }
    else {
      errors = await categoryTree.addCategory(values.name, selectedGroup);
    }

    if (errors && errors.length > 0) {
      // Display the first error
      // TODO: Display all the errors?
      setErrors({ [errors[0].field]: errors[0].message });
    }
    else {
      setShow(false);
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

    const errors = await category.delete();

    if (errors && errors.length > 0) {
      setErrors({ [errors[0].field]: errors[0].message });
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
      options.push(<option key="nogroup" value={-1}>No Group</option>);
    }

    return options.concat(
      categoryTree.nodes.map((g) => (
        <option key={g.id} value={g.id}>{g.name}</option>
      )),
    )
  }

  return (
    <FormModal<ValueType>
      show={show}
      setShow={setShow}
      onHide={onHide}
      initialValues={{
        name: category && category.name ? category.name : '',
        groupId: group ? group.id.toString() : '',
      }}
      validate={handleValidate}
      onSubmit={handleSubmit}
      onDelete={category ? handleDelete : null}
      title={title()}
      formId="catDialogForm"
    >
      <div
        style={{
          display: 'flex',
          columnGap: '1rem',
        }}
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
        <label>
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

CategoryDialog.defaultProps = {
  category: undefined,
};

export const useCategoryDialog = (): UseModalType<Props> => useModal<Props>(CategoryDialog);

export default CategoryDialog;
