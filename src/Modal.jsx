import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { Modal, Button } from 'react-bootstrap';
import { Formik, Form, useFormikContext } from 'formik';

function ModalLauncher({
    launcher,
    dialog,
    ...props
}) {
    const [show, setShow] = useState({ show: false, exited: true });

    const handleShow = () => {
        setShow({ show: true, exited: false });
    };
    const handleClose = () => {
        setShow({ show: false, exited: false });
    };
    const handleExited = () => {
        setShow({ show: false, exited: true });
    };

    const Launcher = launcher;

    if (show.show || !show.exited) {
        const Dialog = dialog;

        return (
            <>
                <Launcher onClick={handleShow} />
                <Dialog
                    show={show.show}
                    onClose={handleClose}
                    onExited={handleExited}
                    {...props}
                />
            </>
        );
    }

    return (
        <Launcher onClick={handleShow} />
    );
}

ModalLauncher.propTypes = {
    launcher: PropTypes.func.isRequired,
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
    size,
    scrollable,
}) {
    const [doDelete, setDoDelete] = useState(false);

    const DeleteHandler = ({ performDelete }) => {
        const bag = useFormikContext();

        useEffect(() => {
            if (performDelete) {
                onDelete(bag);
                setDoDelete(false);
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

    const handleClick = (event) => {
        event.stopPropagation();
    };

    const renderForm = () => {
        if (form) {
            return (
                <Formik
                    initialValues={initialValues}
                    validate={validate}
                    onSubmit={onSubmit}
                >
                    <>
                        <DeleteHandler performDelete={doDelete} />
                        <Form id="modalForm" className="scrollable-form">
                            {form()}
                        </Form>
                    </>
                </Formik>
            );
        }

        return null;
    };

    return (
        <Modal
            show={show}
            animation
            onHide={onClose}
            onExited={onExited}
            size={size}
            scrollable={scrollable}
            onClick={handleClick}
        >
            <Modal.Header closeButton>
                <Modal.Title>{title}</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                {renderForm()}
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
    form: PropTypes.func,
    show: PropTypes.bool.isRequired,
    initialValues: PropTypes.shape().isRequired,
    validate: PropTypes.func.isRequired,
    onSubmit: PropTypes.func.isRequired,
    size: PropTypes.string,
    scrollable: PropTypes.bool,
};

ModalDialog.defaultProps = {
    form: null,
    onDelete: undefined,
    size: 'md',
    scrollable: false,
};

export { ModalLauncher, ModalDialog };
