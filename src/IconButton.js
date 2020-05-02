import React from 'react';
import PropTypes from 'prop-types';

function IconButton(props) {
    
    let className = 'fas fa-' + props.icon;

    return (
        <div className='btn btn-sm group-button' onClick={props.onClick}>
            <i className={className}></i>
        </div>);
}

IconButton.propTypes = {
    icon: PropTypes.string.isRequired
}

export default IconButton;
