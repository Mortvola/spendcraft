import React, { ReactElement, ReactNode } from 'react';
import {
  Formik, Form, FormikContextType, FormikHelpers, FormikErrors,
} from 'formik';
import { Modal, ModalBody } from 'react-bootstrap';
import Header from './Header';
import Footer from './Footer';
import { ModalProps } from './useModal';

type PropsType<T> = {
  show: boolean,
  onHide: (() => void),
  initialValues: T,
  title: string,
  formId: string,
  children?: ReactNode,
  onSubmit: ((values: T, bag: FormikHelpers<T>) => void),
  validate: ((values: T) => FormikErrors<T>),
  onDelete?: ((bag: FormikContextType<T>) => void) | null,
  errors?: string[],
  size?: 'sm' | 'lg' | 'xl',
}

function FormModal<ValueType>({
  show,
  setShow,
  onHide,
  initialValues,
  title,
  formId,
  children,
  onSubmit,
  validate,
  onDelete,
  errors,
  size,
}: PropsType<ValueType> & ModalProps): ReactElement {
  return (
    <Modal
      show={show}
      onHide={onHide}
      size={size}
      scrollable
      enforceFocus={false}
      contentClassName="modal-content-fix"
    >
      <Formik<ValueType>
        initialValues={initialValues}
        validate={validate}
        onSubmit={onSubmit}
      >
        <Form id={formId} className="scrollable-form">
          <Header title={title} />
          <ModalBody>
            {children}
          </ModalBody>
          <Footer<ValueType> setShow={setShow} handleDelete={onDelete} errors={errors} />
        </Form>
      </Formik>
    </Modal>
  );
}

export default FormModal;
