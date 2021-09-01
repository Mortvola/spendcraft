import React, { ReactElement } from 'react';
import { Field } from 'formik';
import FormError from './FormError';

type PropsType = {
  name: string,
  label?: string,
  readOnly?: boolean,
};

const FormCheckbox = ({
  name,
  label,
  readOnly,
}: PropsType): ReactElement => (
  <label style={{ padding: '0.5rem 0.5rem 0.5rem 0', userSelect: 'none' }}>
    <Field
      type="checkbox"
      style={{ marginRight: '0.5rem' }}
      readOnly={readOnly}
      name={name}
    />
    {label}
    <FormError name={name} />
  </label>
);

export default FormCheckbox;
