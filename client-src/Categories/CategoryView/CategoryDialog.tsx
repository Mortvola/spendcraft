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
  FormModal, FormError, setFormErrors, FormField, FormCheckbox,
} from '@mortvola/forms';
import { isGroup } from '../../State/Group';
import { useStores } from '../../State/mobxStore';
import { CategoryInterface, GroupInterface } from '../../State/State';

type Props = {
  category?: CategoryInterface | null,
  group: GroupInterface,
}

const CategoryDialog: React.FC<Props & ModalProps> = ({
  setShow,
  category = null,
  group,
}) => {
  const { categoryTree } = useStores();

  type FormValues = {
    name: string,
    groupId: string,
    monthlyExpenses: boolean,
  }

  const handleSubmit = async (values: FormValues, bag: FormikHelpers<FormValues>) => {
    const { setErrors } = bag;
    let errors = null;

    const selectedGroup = (categoryTree.nodes.find((g) => g.id === parseInt(values.groupId, 10))
      ?? categoryTree.noGroupGroup);

    if (selectedGroup === null || !isGroup(selectedGroup)) {
      throw new Error('group is not a group');
    }

    if (category) {
      errors = await category.update(values.name, selectedGroup, values.monthlyExpenses);
    }
    else {
      errors = await selectedGroup.addCategory(values.name, values.monthlyExpenses);
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

  return (
    <FormModal<FormValues>
      setShow={setShow}
      initialValues={{
        name: category && category.name ? category.name : '',
        groupId: group ? group.id.toString() : '',
        monthlyExpenses: category ? category.monthlyExpenses : false,
      }}
      validate={handleValidate}
      onSubmit={handleSubmit}
      onDelete={category ? handleDelete : null}
      title={title()}
      formId="catDialogForm"
    >
      <div>
        <div
          style={{
            display: 'flex',
            columnGap: '1rem',
          }}
        >
          <FormField name="name" label="Category:" />
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
        <FormCheckbox name="monthlyExpenses" label="Used for monthly expenses" />
      </div>
    </FormModal>
  );
};

export const useCategoryDialog = makeUseModal<Props>(CategoryDialog);

export default CategoryDialog;
