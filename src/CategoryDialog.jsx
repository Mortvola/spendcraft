/* eslint-disable jsx-a11y/label-has-associated-control */
import 'regenerator-runtime/runtime';
import React from 'react';
import PropTypes from 'prop-types';
import { Field, ErrorMessage } from 'formik';
import { connect } from 'react-redux';
import { addCategory, updateCategory, deleteCategory } from './redux/actions';
import { ModalDialog } from './Modal';

const CategoryDialog = (props) => {
    const {
        onClose,
        onExited,
        title,
        show,
        category,
        groupId,
        dispatch,
    } = props;

    const handleSubmit = (values, bag) => {
        const { setErrors } = bag;
        if (category) {
            fetch(`/groups/${groupId}/categories/${category.id}`, {
                method: 'PATCH',
                headers:
                {
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]').getAttribute('content'),
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ name: values.name }),
            })
                .then(async (response) => {
                    const json = await response.json();

                    if (response.ok) {
                        dispatch(updateCategory({ id: category.id, groupId, name: json.name }));
                        onClose();
                    }
                    else if (json.errors && json.errors.length > 0) {
                        // Display the first error
                        // TODO: Display all the errors?
                        setErrors({ name: json.errors[0].message });
                    }
                    else {
                        setErrors({ name: 'Unknown error' });
                    }
                });
        }
        else {
            fetch(`/groups/${groupId}/categories`, {
                method: 'POST',
                headers:
                {
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]').getAttribute('content'),
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ groupId, name: values.name }),
            })
                .then(async (response) => {
                    const json = await response.json();

                    if (response.ok) {
                        dispatch(addCategory({
                            id: json.id,
                            groupId: json.groupId,
                            name: json.name,
                            amount: 0,
                        }));
                        onClose();
                    }
                    else if (json.errors && json.errors.length > 0) {
                        // Display the first error
                        // TODO: Display all the errors?
                        setErrors({ name: json.errors[0].message });
                    }
                    else {
                        setErrors({ name: 'Unknown error' });
                    }
                });
        }
    };

    const handleValidate = (values) => {
        const errors = {};

        if (values.name === '') {
            errors.name = 'The category name must not be blank.';
        }

        return errors;
    };

    const handleDelete = (bag) => {
        const { setTouched, setErrors } = bag;

        fetch(`/groups/${groupId}/categories/${category.id}`, {
            method: 'DELETE',
            headers:
            {
                'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]').getAttribute('content'),
                'Content-Type': 'application/json',
            },
        })
            .then(async (response) => {
                if (response.ok) {
                    dispatch(deleteCategory({ id: category.id, groupId }));
                    onClose();
                }
                else {
                    const json = await response.json();
                    setTouched({ name: true }, false);

                    if (json.errors && json.errors.length > 0) {
                        // Display the first error
                        // TODO: Display all the errors?
                        setErrors({ name: json.errors[0].message });
                    }
                    else {
                        setErrors({ name: 'Unknown error' });
                    }
                }
            });
    };

    return (
        <ModalDialog
            initialValues={{
                name: category && category.name ? category.name : '',
            }}
            validate={handleValidate}
            onSubmit={handleSubmit}
            show={show}
            onDelete={category
                ? handleDelete
                : undefined}
            onClose={onClose}
            onExited={onExited}
            title={title}
            form={() => (
                <>
                    <label>
                        Category:
                        <Field
                            type="text"
                            className="form-control"
                            name="name"
                        />
                    </label>
                    <br />
                    <ErrorMessage name="name" />
                </>
            )}
        />
    );
};

CategoryDialog.propTypes = {
    category: PropTypes.shape({
        id: PropTypes.number.isRequired,
        name: PropTypes.string.isRequired,
    }),
    groupId: PropTypes.number.isRequired,
    onClose: PropTypes.func.isRequired,
    onExited: PropTypes.func.isRequired,
    title: PropTypes.string.isRequired,
    show: PropTypes.bool.isRequired,
    dispatch: PropTypes.func.isRequired,
};

CategoryDialog.defaultProps = {
    category: undefined,
};

export default connect()(CategoryDialog);
