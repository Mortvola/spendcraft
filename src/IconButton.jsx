import React from 'react';
import PropTypes from 'prop-types';

function IconButton({ icon, onClick }) {
    const className = `fas fa-${icon}`;

    return (
        <div className="btn btn-sm group-button" onClick={onClick}>
            <i className={className} />
        </div>
    );
}

IconButton.propTypes = {
    icon: PropTypes.string.isRequired,
    onClick: PropTypes.func.isRequired,
};

export default IconButton;
