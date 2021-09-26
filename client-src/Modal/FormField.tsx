import React, { ChangeEvent, ReactElement, ReactNode } from 'react';
import {
  Field, FieldProps, useField, useFormikContext,
} from 'formik';
import FormError from './FormError';

type PropsType<V, T, E> = {
  name: string,
  label?: string,
  as?: unknown,
  type?: string,
  readOnly?: boolean,
  autoComplete?: string,
  onChange?: (event: ChangeEvent<E>, props: FieldProps<V, T>) => void,
  onBlur?: (event: ChangeEvent<E>, props: FieldProps<V, T>) => void,
  children?: ReactNode,
};

function FormField<V = unknown, T = unknown, E = HTMLInputElement>({
  name,
  label,
  as,
  type,
  readOnly,
  autoComplete,
  onChange,
  onBlur,
  children,
}: PropsType<V, T, E>): ReactElement {
  const [field, meta] = useField<V>(name)
  const form = useFormikContext<T>();

  const handleChange = (event: ChangeEvent<E>) => {
    field.onChange(event);
    if (onChange) {
      onChange(event, { field, form, meta });
    }
  }

  const handleBlur = (event: ChangeEvent<E>) => {
    field.onBlur(event);
    if (onBlur) {
      onBlur(event, { field, form, meta });
    }
  }

  return (
    <label style={{ userSelect: 'none', marginTop: '0.5rem' }}>
      {label}
      <Field
        as={as}
        type={type ?? 'text'}
        className="form-control"
        readOnly={readOnly}
        autoComplete={autoComplete}
        name={name}
        onChange={handleChange}
        onBlur={handleBlur}
      >
        {children}
      </Field>
      <FormError name={name} />
    </label>
  );
}

export default FormField;
