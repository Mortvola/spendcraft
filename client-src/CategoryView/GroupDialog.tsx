/* eslint-disable jsx-a11y/label-has-associated-control */
import React, { ReactElement, useContext } from 'react';
import {
  Field,
  FormikHelpers,
  FormikErrors,
  FormikContextType,
} from 'formik';
import { makeUseModal, ModalProps } from '@mortvola/usemodal';
import { FormModal, FormError, setFormErrors } from '@mortvola/forms';
import MobxStore from '../State/mobxStore';
import { Error } from '../../common/ResponseTypes';
import { GroupInterface } from '../State/State';

interface Props {
  // eslint-disable-next-line react/require-default-props
  group?: GroupInterface,
}

const GroupDialog = ({
  setShow,
  group,
}: Props & ModalProps): ReactElement => {
  const { categoryTree } = useContext(MobxStore);

  interface ValueType {
    name: string,
  }

  const handleSubmit = async (values: ValueType, formikHelpers: FormikHelpers<ValueType>) => {
    const { setErrors } = formikHelpers;
    let errors: Array<Error> | null = null;

    if (group) {
      errors = await group.update(values.name);
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

  return (
    <FormModal<ValueType>
      setShow={setShow}
      initialValues={{
        name: group && group.name ? group.name : '',
      }}
      title={title()}
      formId="GroupDialogForm"
      validate={handleValidate}
      onSubmit={handleSubmit}
      onDelete={group ? handleDelete : null}
    >
      <label>
        Group:
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

export const useGroupDialog = makeUseModal<Props>(GroupDialog);

export default GroupDialog;
