import React from 'react';
import PropTypes from 'prop-types';
import { Field, ErrorMessage } from 'formik';
import { ModalDialog } from './Modal';

function GroupDialog(props) {
    const {
        onClose,
        onExited,
        title,
        show,
        group,
    } = props;

    const handleSubmit = (values, bag) => {
        const { setErrors } = bag;
        if (group) {
            $.ajax({
                url: `/groups/${group.id}`,
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
                    onClose();
                });
        }
        else {
            $.post({
                url: '/groups',
                headers:
                {
                    'X-CSRF-TOKEN': $('meta[name="csrf-token"]').attr('content'),
                },
                contentType: 'application/json',
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

                    onClose();
                });
        }
    };

    const handleValidate = (values) => {
        const errors = {};

        if (values.name === '') {
            errors.name = 'The group name must not be blank.';
        }

        return errors;
    };

    const handleDelete = (bag) => {
        const { setTouched, setErrors }  = bag;

        $.ajax({
            url: `/groups/${group.id}`,
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
            .done((response) => {
                onClose();
            });
    };

    return (
        <ModalDialog
            initialValues={{
                name: group && group.name ? group.name : '',
            }}
            validate={handleValidate}
            onSubmit={handleSubmit}
            show={show}
            onDelete={group
                ? handleDelete
                : undefined}
            onClose={onClose}
            onExited={onExited}
            title={title}
            form={() => (
                <>
                    <label>
                        Group:
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
}

GroupDialog.propTypes = {
    group: PropTypes.shape({
        id: PropTypes.number.isRequired,
        name: PropTypes.string.isRequired,
    }),
    onClose: PropTypes.func.isRequired,
    onExited: PropTypes.func.isRequired,
    title: PropTypes.string.isRequired,
    show: PropTypes.bool.isRequired,
};

GroupDialog.defaultProps = {
    group: undefined,
};

export default GroupDialog;
