/* eslint-disable jsx-a11y/label-has-associated-control */
import React, { ReactElement, useContext } from 'react';
import {
  Field,
  FormikHelpers,
  FormikErrors,
  FormikContextType,
} from 'formik';
import MobxStore from '../state/mobxStore';
import useModal, { UseModalType, ModalProps } from '../Modal/useModal';
import Group from '../state/Group';
import { Error } from '../../common/ResponseTypes';
import FormModal from '../Modal/FormModal';
import FormError from '../Modal/FormError';

interface Props {
  // eslint-disable-next-line react/require-default-props
  group?: Group,
}

const GroupDialog = ({
  onHide,
  show,
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
      errors.name = 'The group name must not be blank.';
    }

    return errors;
  };

  const handleDelete = async (bag: FormikContextType<ValueType>) => {
    const { setTouched, setErrors } = bag;

    if (group) {
      const errors = await categoryTree.deleteGroup(group.id);

      if (errors && errors.length > 0) {
        setTouched({ name: true }, false);
        setErrors({ [errors[0].field]: errors[0].message });
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
      show={show}
      setShow={setShow}
      onHide={onHide}
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

export const useGroupDialog = (): UseModalType<Props> => useModal<Props>(GroupDialog);

export default GroupDialog;
