import React from 'react';
import PropTypes from 'prop-types';

function IconButton(props) {
    const className = `fas fa-${props.icon}`;

    return (
        <div className="btn btn-sm group-button" onClick={props.onClick}>
            <i className={className} />
      </div>);
}

IconButton.propTypes = {
    icon: PropTypes.string.isRequired,
};

export default IconButton;
