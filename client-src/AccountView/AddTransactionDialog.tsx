import { Field, FormikErrors } from 'formik';
import React from 'react';
import AmountInput from '../AmountInput';
import FormError from '../Modal/FormError';
import FormModal from '../Modal/FormModal';
import useModal, { ModalProps, useModalType } from '../Modal/useModal';
import { AccountInterface } from '../state/State';

type PropsType = {
    account: AccountInterface,
}

const AddTransactionDialog = ({
    account,
    show,
    onHide,
}: PropsType & ModalProps) => {
    type ValuesType = {
        date: string,

        name: string,

        amount: string,
    };

    const handleSubmit = async (values: ValuesType) => {
        const errors = await account.addTransaction({ ...values, amount: parseFloat(values.amount), });

        if (errors) {

        }
        else {
            onHide();
        }
    };

    const handleValidate = (values: ValuesType): FormikErrors<ValuesType> => {
        const errors: FormikErrors<ValuesType> = {}

        return errors;
    }

    return (
        <FormModal<ValuesType>
            initialValues={{
                date: '',
                name: '',
                amount: '',
            }}
            show={show}
            onHide={onHide}
            title="Add Transaction"
            formId="AddTransaction"
            onSubmit={handleSubmit}
            validate={handleValidate}
        >
            <label>
                Date:
                <Field className="form-control" type="date" name="date" />
            </label>
            <label>
                Name:
                <Field
                    type="text"
                    className="form-control"
                    name="name"
                />
                <FormError name="name" />
            </label>
            <label>
                Amount:
                <Field
                    as={AmountInput}
                    className="form-control"
                    name="amount"
                />
                <FormError name="amount" />
            </label>
        </FormModal>
    );
};

export const useAddTransactionDialog = (): useModalType<PropsType> => useModal<PropsType>(AddTransactionDialog);

export default AddTransactionDialog;
