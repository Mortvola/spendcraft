/* eslint-disable jsx-a11y/label-has-associated-control */
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
            $.ajax({
                url: `/groups/${groupId}/categories/${category.id}`,
                headers:
                {
                    'X-CSRF-TOKEN': $('meta[name="csrf-token"]').attr('content'),
                },
                contentType: 'application/json',
                method: 'PATCH',
                data: JSON.stringify({ name: values.name }),
            })
                .fail((jqXHR) => {
                    if (jqXHR.responseJSON.errors && jqXHR.responseJSON.errors.length > 0) {
                        // Display the first error
                        // TODO: Display all the errors?
                        setErrors({ name: jqXHR.responseJSON.errors[0].message });
                    }
                    else {
                        setErrors({ name: 'Unknown error' });
                    }
                })
                .done((response) => {
                    // $(catElement.find('.cat-list-name')).text(response.name);
                    dispatch(updateCategory({ id: category.id, groupId, name: response.name }));
                    onClose();
                });
        }
        else {
            $.post({
                url: `/groups/${groupId}/categories`,
                headers:
                {
                    'X-CSRF-TOKEN': $('meta[name="csrf-token"]').attr('content'),
                },
                contentType: 'application/json',
                data: JSON.stringify({ groupId, name: values.name }),
            })
                .fail((jqXHR) => {
                    if (jqXHR.responseJSON.errors && jqXHR.responseJSON.errors.length > 0) {
                        // Display the first error
                        // TODO: Display all the errors?
                        setErrors({ name: jqXHR.responseJSON.errors[0].message });
                    }
                    else {
                        setErrors({ name: 'Unknown error' });
                    }
                })
                .done((response) => {
                    // let newCategoryElement = createCategoryTreeElement(response.id,
                    // groupId, systemGroup, response.name, response.amount,
                    // groupElement.find('.group-name'));

                    // const categoryElements = $(groupElement).children('.cat-list-cat');

                    // for (const categoryElement of categoryElements) {
                    //     const name = $(categoryElement).find('.cat-list-name').text();

                    //     const compare = name.localeCompare(response.name);

                    //     if (compare > 0) {
                    //         newCategoryElement.insertBefore(categoryElement);
                    //         newCategoryElement = null;
                    //         break;
                    //     }
                    // }

                    // if (newCategoryElement !== null) {
                    //     newCategoryElement.appendTo(groupElement);
                    // }

                    dispatch(addCategory({ id: response.id, groupId: response.groupId, name: response.name, amount: 0 }));
                    onClose();
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

        $.ajax({
            url: `/groups/${groupId}/categories/${category.id}`,
            headers:
            {
                'X-CSRF-TOKEN': $('meta[name="csrf-token"]').attr('content'),
            },
            contentType: 'application/json',
            method: 'DELETE',
        })
            .fail((jqXHR) => {
                if (jqXHR.responseJSON.errors) {
                    // Display the first error
                    // TODO: Display all the errors?
                    setTouched({ name: true }, false);
                    setErrors({ name: jqXHR.responseJSON.errors[0].message });
                }
            })
            .done(() => {
                dispatch(deleteCategory({ id: category.id, groupId }));
                onClose();
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
