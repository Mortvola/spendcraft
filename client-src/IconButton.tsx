import React, { ReactElement } from 'react';
import PropTypes from 'prop-types';

interface Props {
  icon: string;
  rotate: boolean;
  onClick: () => void;
}

function IconButton({
  icon,
  rotate,
  onClick,
}: Props): ReactElement {
  let className = `fas fa-${icon}`;

  if (rotate) {
    className += ' rotate';
  }

  return (
    <button type="button" className="btn btn-sm group-button" onClick={onClick}>
      <i className={className} />
    </button>
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
