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
import { useStores } from '../../State/Store';
import { ErrorProps, GroupType } from '../../../common/ResponseTypes';
import { CategoryInterface, GroupInterface } from '../../State/Types';
import styles from './GroupDialog.module.scss';
import { isGroup } from '../../State/Group';

interface PropsType {
  group?: GroupInterface,
}

const GroupDialog: React.FC<PropsType & ModalProps> = ({
  setShow,
  group,
}) => {
  const { categoryTree } = useStores();

  interface ValueType {
    name: string,
    parentGroupId: number | null,
  }

  const handleSubmit = async (values: ValueType, formikHelpers: FormikHelpers<ValueType>) => {
    const { setErrors } = formikHelpers;
    let errors: ErrorProps[] | null = null;

    let parentGroupId = categoryTree.budget.id;

    if (typeof values.parentGroupId === 'string') {
      parentGroupId = parseInt(values.parentGroupId, 10)
    }
    else if (values.parentGroupId !== null) {
      parentGroupId = values.parentGroupId
    }

    if (group) {
      errors = await group.update({ name: values.name, parentGroupId });
    }
    else {
      errors = await categoryTree.addGroup(values.name, parentGroupId);
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
      errors.name = 'The group name must not be blank.';
    }

    return errors;
  };

  const handleDelete = async (bag: FormikContextType<ValueType>) => {
    const { setErrors } = bag;

    if (group) {
      const errors = await group.delete();

      if (errors) {
        setFormErrors(setErrors, errors);
      }
      else {
        setShow(false);
      }
    }
  };

  const title = () => {
    if (group) {
      return 'Edit Group';
    }

    return 'Add Group';
  };

  const populateGroups = () => {
    const options = [];

    options.push(<option key="nogroup" value={categoryTree.budget.id}>None</option>);

    let stack: (GroupInterface | CategoryInterface)[] = [...categoryTree.budget.children]

    while (stack.length > 0) {
      const g = stack[0];
      stack = stack.slice(1)

      if (isGroup(g) && g.type === GroupType.Regular) {
        if (group === undefined || g.id !== group.id) {
          options.push(<option key={g.id} value={g.id}>{g.name}</option>)
        }

        stack = [
          ...g.children,
          ...stack,
        ]
      }
    }

    return options
  }

  return (
    <FormModal<ValueType>
      setShow={setShow}
      initialValues={{
        name: group?.name ?? '',
        parentGroupId: group?.group!.id ?? null,
      }}
      title={title()}
      formId="GroupDialogForm"
      validate={handleValidate}
      onSubmit={handleSubmit}
      onDelete={group ? handleDelete : null}
    >
      <div className={styles.layout}>
        <label>
          Group:
          <Field
            type="text"
            className="form-control"
            name="name"
          />
          <FormError name="name" />
        </label>

        <label>
          Parent Group:
          <Field
            className="form-control"
            name="parentGroupId"
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
    </FormModal>
  );
};

export const useGroupDialog = makeUseModal<PropsType>(GroupDialog);

export default GroupDialog;
