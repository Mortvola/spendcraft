/* eslint-disable jsx-a11y/label-has-associated-control */
import React, { ReactElement, useContext } from 'react';
import {
  Field,
  FormikHelpers,
  FormikContextType,
  FormikErrors,
  FieldProps,
} from 'formik';
import { makeUseModal, ModalProps } from '@mortvola/usemodal';
import { isGroup } from '../State/Group';
import FormModal from '../Modal/FormModal';
import FormError from '../Modal/FormError';
import MobxStore from '../State/mobxStore';
import { CategoryInterface, GroupInterface } from '../State/State';
import { setFormErrors } from '../Modal/Errors';

type Props = {
  category?: CategoryInterface | null,
  group: GroupInterface,
}

const CategoryDialog = ({
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
      errors = await selectedGroup.addCategory(values.name);
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
    <FormModal<ValueType>
      setShow={setShow}
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

export const useCategoryDialog = makeUseModal<Props>(CategoryDialog);

export default CategoryDialog;
