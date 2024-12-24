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
import { Error, GroupType } from '../../../common/ResponseTypes';
import { GroupInterface } from '../../State/Types';
import styles from './GroupDialog.module.scss';
import { isGroup } from '../../State/Group';

type PropsType = {
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
    let errors: Array<Error> | null = null;

    if (group) {
      errors = await group.update({ name: values.name, parentGroupId: values.parentGroupId ?? null });
    }
    else {
      errors = await categoryTree.addGroup(values.name);
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

    if (categoryTree.noGroupGroup !== null) {
      options.push(<option key="nogroup" value={categoryTree.noGroupGroup.id}>None</option>);
    }

    return options.concat(
      categoryTree.budget.children
        .filter((g) => isGroup(g) && g.type === GroupType.Regular && g.id !== group?.id)
        .map((g) => (
          <option key={g.id} value={g.id}>{g.name}</option>
        )),
    )
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
