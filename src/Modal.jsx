import React, { useState } from 'react';
import PropTypes from 'prop-types';


function ModalLauncher({ dialog, launcher }) {
    const [show, setShow] = useState(false);

    const handleClose = () => setShow(false);
    const handleShow = () => setShow(true);

    return (
        <>
            {launcher({ onClick: handleShow })}
            {dialog({ show, handleClose })}
        </>
    );
}

ModalLauncher.propTypes = {
    launcher: PropTypes.func.isRequired,
    dialog: PropTypes.func.isRequired,
};

export default ModalLauncher;
