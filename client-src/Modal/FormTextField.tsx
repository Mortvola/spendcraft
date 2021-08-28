import { Field } from 'formik';
import React, { ReactElement, ReactNode } from 'react';
import FormError from './FormError';

type PropsType = {
  name: string,
  label?: string,
  as?: unknown,
  type?: string,
  readOnly?: boolean,
  children?: ReactNode,
};

const FormTextField = ({
  name,
  label,
  as,
  type,
  readOnly,
  children,
}: PropsType): ReactElement => (
  <label>
    {label}
    {children}
    <Field
      as={as}
      type={type ?? 'text'}
      className="form-control"
      readOnly={readOnly}
      name={name}
    />
    <FormError name={name} />
  </label>
);

export default FormTextField;