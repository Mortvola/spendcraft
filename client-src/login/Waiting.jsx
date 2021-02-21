import React from 'react';
import PropTypes from 'prop-types';
import { Spinner } from 'react-bootstrap';

const Waiting = ({
  show,
}) => (
  show
    ? (
      <div className="wait-background">
        <Spinner
          animation="border"
          className="abs-centered"
          variant="light"
        />
      </div>
    )
    : null
);

Waiting.propTypes = {
  show: PropTypes.bool.isRequired,
};

export default Waiting;
