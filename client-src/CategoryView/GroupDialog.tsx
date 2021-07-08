/* eslint-disable jsx-a11y/label-has-associated-control */
import React, { ReactElement, useContext } from 'react';
import { Modal, Button, ModalBody } from 'react-bootstrap';
import {
  Formik, Form, Field, ErrorMessage,
  useFormikContext, FormikHelpers,
  FormikErrors,
  FormikContextType,
} from 'formik';
import MobxStore from '../state/mobxStore';
import useModal, { ModalProps } from '../useModal';
import Group from '../state/Group';
import { Error } from '../../common/ResponseTypes';

interface Props {
  // eslint-disable-next-line react/require-default-props
  group?: Group,
}

const GroupDialog = ({
  onHide,
  show,
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
      setErrors({ name: errors[0].title });
    }
    else {
      onHide();
    }
  };

  const handleValidate = (values: ValueType) => {
    const errors: FormikErrors<ValueType> = {};

    if (values.name === '') {
      errors.name = 'The group name must not be blank.';
    }

    return errors;
  };

  const handleDelete = async (bag: FormikContextType<unknown>) => {
    const { setTouched, setErrors } = bag;

    if (group) {
      const errors = await categoryTree.deleteGroup(group.id);

      if (errors && errors.length > 0) {
        setTouched({ name: true }, false);
        setErrors({ name: errors[0].title });
      }
      else {
        onHide();
      }
    }
  };

  const Header = () => {
    let title = 'Add Group';
    if (group) {
      title = 'Edit Group';
    }

    return (
      <Modal.Header closeButton>
        <h4 id="modalTitle" className="modal-title">{title}</h4>
      </Modal.Header>
    );
  };

  const DeleteButton = () => {
    const bag = useFormikContext();

    if (group) {
      return (<Button variant="danger" onClick={() => handleDelete(bag)}>Delete</Button>);
    }

    return <div />;
  };

  const Footer = () => (
    <Modal.Footer>
      <DeleteButton />
      <div />
      <Button variant="secondary" onClick={onHide}>Cancel</Button>
      <Button variant="primary" type="submit">Save</Button>
    </Modal.Footer>
  );

  return (
    <Modal
      show={show}
      onHide={onHide}
    >
      <Formik<ValueType>
        initialValues={{
          name: group && group.name ? group.name : '',
        }}
        validate={handleValidate}
        onSubmit={handleSubmit}
      >
        <Form id="GroupDialogForm" className="scrollable-form">
          <Header />
          <ModalBody>
            <label>
              Group:
              <Field
                type="text"
                className="form-control"
                name="name"
              />
            </label>
            <br />
            <ErrorMessage name="name" />
          </ModalBody>
          <Footer />
        </Form>
      </Formik>
    </Modal>
  );
};

// GroupDialog.propTypes = {
//   group: PropTypes.shape({
//     id: PropTypes.number.isRequired,
//     name: PropTypes.string.isRequired,
//     update: PropTypes.func.isRequired,
//   }),
//   onHide: PropTypes.func.isRequired,
//   show: PropTypes.bool.isRequired,
// };

// GroupDialog.defaultProps = {
//   group: undefined,
// };

export const useGroupDialog = (): [
  (props: Props) => (ReactElement | null),
  () => void,
] => useModal<Props>(GroupDialog);

export default GroupDialog;
