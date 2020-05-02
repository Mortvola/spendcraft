import React, {useState} from 'react';
import PropTypes from 'prop-types';


function ModalLauncher (props) {
    const [show, setShow] = useState(false);

    const handleClose = () => setShow(false);
    const handleShow = () => setShow(true);

    return (
        <>
        {props.launcher({onClick: handleShow})}
		{props.dialog({show: show, handleClose: handleClose})}
        </>
    );
}

ModalLauncher.propTypes = {
    launcher: PropTypes.func,
    dialog: PropTypes.func,
}

export default ModalLauncher;
