import React, { ReactElement } from 'react';
import PropTypes from 'prop-types';

let key = 0;

type PropTypes = {
  errors?: string[],
}

const Errors = ({
  errors,
}: PropTypes): ReactElement => (
  <>
    {
      errors
        ? errors.map((e) => {
          key += 1;
          return <div key={key} style={{ fontSize: 'small' }}>{e}</div>;
        })
        : null
    }
  </>
);

Errors.propTypes = {
  errors: PropTypes.arrayOf(PropTypes.string).isRequired,
};

export default Errors;
