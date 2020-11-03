import React from 'react';
import PropTypes from 'prop-types';

function IconButton({ icon, rotate, onClick }) {
  let className = `fas fa-${icon}`;

  if (rotate) {
    className += ' rotate';
  }

  return (
    <div className="btn btn-sm group-button" onClick={onClick}>
      <i className={className} />
    </div>
  );
}

IconButton.propTypes = {
  icon: PropTypes.string.isRequired,
  onClick: PropTypes.func.isRequired,
  rotate: PropTypes.bool,
};

IconButton.defaultProps = {
  rotate: false,
};

export default IconButton;
