import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { Modal, Button } from 'react-bootstrap';
import { Formik, Form, useFormikContext } from 'formik';

function ModalLauncher({
    launcher,
    dialog,
    title,
}) {
    const [show, setShow] = useState(false);
    const [exited, setExited] = useState(true);

    const handleShow = () => {
        setShow(true);
        setExited(false);
    };
    const handleClose = () => {
        setShow(false);
    };
    const handleExited = () => {
        setExited(true);
    };

    const Launcher = launcher;

    if (show || !exited) {
        const Dialog = dialog;

        return (
            <>
                <Launcher onClick={handleShow} />
                <Dialog show={show} onClose={handleClose} onExited={handleExited} title={title} />
            </>
        );
    }

    return (
        <Launcher onClick={handleShow} />
    );
}

ModalLauncher.propTypes = {
    launcher: PropTypes.func.isRequired,
    title: PropTypes.string.isRequired,
    dialog: PropTypes.func.isRequired,
};

function ModalDialog({
    show,
    onClose,
    onExited,
    onDelete,
    title,
    form,
    initialValues,
    validate,
    onSubmit,
}) {
    const [doDelete, setDoDelete] = useState(false);

    const DeleteHandler = ({ performDelete }) => {
        const bag = useFormikContext ();

        useEffect(() => {
            if (performDelete) {
                onDelete(bag);
            }
        }, [doDelete, bag]);

        return null;
    };

    const handleDelete = () => {
        setDoDelete(true);
    };

    const DeleteButton = () => {
        if (onDelete) {
            return (<Button variant="danger" onClick={handleDelete}>Delete</Button>);
        }

        return <div />;
    };

    return (
        <Modal show={show} animation onHide={onClose} onExited={onExited}>
            <Modal.Header closeButton>
                <Modal.Title>{title}</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <Formik
                    initialValues={initialValues}
                    validate={validate}
                    onSubmit={onSubmit}
                >
                    <>
                        <DeleteHandler performDelete={doDelete} />
                        <Form id="modalForm">
                            {form()}
                        </Form>
                    </>
                </Formik>
            </Modal.Body>
            <Modal.Footer>
                <DeleteButton />
                <div />
                <Button variant="secondary" onClick={onClose}>Cancel</Button>
                <Button variant="primary" type="submit" form="modalForm">Save</Button>
            </Modal.Footer>
        </Modal>
    );
}

ModalDialog.propTypes = {
    onClose: PropTypes.func.isRequired,
    onExited: PropTypes.func.isRequired,
    onDelete: PropTypes.func,
    title: PropTypes.string.isRequired,
    form: PropTypes.func.isRequired,
    show: PropTypes.bool.isRequired,
    initialValues: PropTypes.shape().isRequired,
    validate: PropTypes.func.isRequired,
    onSubmit: PropTypes.func.isRequired,
};

ModalDialog.defaultProps = {
    onDelete: undefined,
};

export { ModalLauncher, ModalDialog };
