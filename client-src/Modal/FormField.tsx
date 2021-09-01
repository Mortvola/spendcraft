import React, { ReactElement, ReactNode } from 'react';
import { Field } from 'formik';
import FormError from './FormError';

type PropsType = {
  name: string,
  label?: string,
  as?: unknown,
  type?: string,
  readOnly?: boolean,
  children?: ReactNode,
};

const FormField = ({
  name,
  label,
  as,
  type,
  readOnly,
  children,
}: PropsType): ReactElement => (
  <label style={{ userSelect: 'none', marginTop: '0.5rem' }}>
    {label}
    <Field
      as={as}
      type={type ?? 'text'}
      className="form-control"
      readOnly={readOnly}
      name={name}
    >
      {children}
    </Field>
    <FormError name={name} />
  </label>
);

export default FormField;
