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

function createIconButton (icon, callback) {
    return $("<div class='btn btn-sm'></div>")
        .html("<i class='fas fa-" + icon + "'></i>")
        .addClass('group-button')
        .on ('click', callback);
}
  
  

export {IconButton, createIconButton};
