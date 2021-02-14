import React from 'react';
import PropTypes from 'prop-types';

let key = 0;

const Errors = ({
  errors,
}) => (
  <>
    {
      errors.map((e) => {
        key += 1;
        return <div key={key} style={{ fontSize: 'small' }}>{e}</div>;
      })
    }
  </>
);

Errors.propTypes = {
  errors: PropTypes.arrayOf(PropTypes.string).isRequired,
};

export default Errors;
