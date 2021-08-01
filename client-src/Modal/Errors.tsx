import React, { CSSProperties, ReactElement } from 'react';
import PropTypes from 'prop-types';

let key = 0;

type PropTypes = {
  errors?: string[],
  style? : CSSProperties,
}

const Errors = ({
  errors,
  style,
}: PropTypes): ReactElement => (
  <div style={style}>
    {
      errors
        ? errors.map((e) => {
          key += 1;
          return <div key={key} className="text-danger" style={{ fontSize: 'small' }}>{e}</div>;
        })
        : null
    }
  </div>
);

export default Errors;
