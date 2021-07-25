import React, { ReactElement, ReactNode } from 'react';
import {
  Formik, Form, FormikContextType, FormikHelpers, FormikErrors,
} from 'formik';
import { Modal, ModalBody } from 'react-bootstrap';
import Header from './Header';
import Footer from './Footer';

type PropsType<T> = {
  show: boolean,
  onHide: (() => void),
  initialValues: T,
  title: string,
  formId: string,
  children: ReactNode,
  onSubmit: ((values: T, bag: FormikHelpers<T>) => void),
  validate: ((values: T) => FormikErrors<T>),
  onDelete?: ((bag: FormikContextType<T>) => void) | null,
}

function FormModal<ValueType>({
  show,
  onHide,
  initialValues,
  title,
  formId,
  children,
  onSubmit,
  validate,
  onDelete,
}: PropsType<ValueType>): ReactElement {
  return (
    <Modal
      show={show}
      onHide={onHide}
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
          <Footer<ValueType> onHide={onHide} handleDelete={onDelete} />
        </Form>
      </Formik>
    </Modal>
  );
}

export default FormModal;
