import React, { ReactElement, ReactNode } from 'react';
import {
  Formik, Form, FormikContextType, FormikHelpers, FormikErrors,
} from 'formik';
import { ModalBody } from 'react-bootstrap';
import Header from './Header';
import Footer from './Footer';

type PropsType<T> = {
  initialValues: T,
  title: string,
  formId?: string,
  children?: ReactNode,
  setShow: (show: boolean) => void,
  onSubmit: ((values: T, bag: FormikHelpers<T>) => void),
  validate: ((values: T) => FormikErrors<T>),
  onDelete?: ((bag: FormikContextType<T>) => void) | null,
  errors?: string[],
}

function FormModal<ValueType>({
  setShow,
  initialValues,
  title,
  formId,
  children,
  onSubmit,
  validate,
  onDelete,
  errors,
}: PropsType<ValueType>): ReactElement {
  return (
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
        <Footer<ValueType> setShow={setShow} onDelete={onDelete} errors={errors} />
      </Form>
    </Formik>
  );
}

export default FormModal;
