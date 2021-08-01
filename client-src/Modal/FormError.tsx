import React, { CSSProperties, ReactElement } from 'react';
import { ErrorMessage } from 'formik';
import Errors from './Errors';

const FormError = ({
  name,
  style,
}: { name: string, style?: CSSProperties }): ReactElement => (
  <ErrorMessage name={name}>
    {
      (msg) => (
        <span className="text-danger" role="alert" style={style}>
          <Errors errors={[msg]} />
        </span>
      )
    }
  </ErrorMessage>
);

export default FormError;
