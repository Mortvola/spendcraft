/* eslint-disable jsx-a11y/label-has-associated-control */
import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { Field, ErrorMessage } from 'formik';
import { ModalDialog } from './Modal';
import Amount from './Amount';

const AccountItem = ({
    name,
    value,
    account,
    onChange,
}) => {
    const [option, setOption] = useState(value);

    const handleChange = (event) => {
        setOption(event.target.value);

        if (onChange) {
            onChange(event);
        }
    };

    return (
        <div className="account-select-item">
            <div className="account-name">
                {account.official_name ? account.official_name : account.name}
            </div>
            <div className="account-type">
                <label>Type:</label>
                <div>{account.subtype}</div>
            </div>
            <div className="account-balance">
                <label>Balance:</label>
                <Amount amount={account.balances.current} />
            </div>
            <div className="track-selection">
                <label>Account Tracking</label>
                <select name={name} value={option} onChange={handleChange}>
                    <option value="None">None</option>
                    <option value="Transactions">Transactions</option>
                    <option value="Balance">Balance</option>
                </select>
            </div>
        </div>
    );
};

AccountItem.propTypes = {
    name: PropTypes.string.isRequired,
    value: PropTypes.string.isRequired,
    account: PropTypes.shape({
        official_name: PropTypes.string,
        name: PropTypes.string,
        subtype: PropTypes.string,
        balances: PropTypes.shape({
            current: PropTypes.number,
        }),
    }).isRequired,
    onChange: PropTypes.func,
};

AccountItem.defaultProps = {
    onChange: null,
};

const AccountsDialog = ({
    onClose,
    title,
    institutionId,
    ...props
}) => {
    const [accountsInitialized, setAccountsInitialized] = useState(false);
    const [accounts, setAccounts] = useState([]);
    const [selections, setSelections] = useState([]);

    const handleValidate = (values) => {
        const errors = {};
        if (!values.selections.some((s) => s !== 'None')) {
            errors.selections = 'No tracking options selected';
        }

        return errors;
    };

    const handleSubmit = (values) => {
        const selectedAccounts = accounts
            .map((a, i) => ({ ...a, tracking: values.selections[i] }))
            .filter((a) => a.tracking !== 'None');

        fetch(`/institution/${institutionId}/accounts`, {
            method: 'POST',
            headers: {
                'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]').getAttribute('content'),
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ accounts: selectedAccounts, startDate: null }),
        })
            .then(
                () => onClose(),
            );

        onClose();
    };

    const fetchAccounts = () => {
        setAccountsInitialized(true);
        fetch(`/institution/${institutionId}/accounts`)
            .then(async (response) => {
                const json = await response.json();
                setAccounts(json);
                setSelections(Array(json.length).fill('None'));
            });
    };

    if (!accountsInitialized) {
        fetchAccounts();
    }

    const listAccounts = () => {
        const accts = [];

        accounts.forEach((acct) => {
            const name = `selections[${accts.length}]`;
            accts.push((
                <Field key={accts.length} name={name} account={acct} as={AccountItem} />
            ));
        });

        return accts;
    };

    const renderForm = () => (
        <>
            {listAccounts()}
            <ErrorMessage name="selections" />
        </>
    );

    return (
        <ModalDialog
            initialValues={{
                selections,
            }}
            validate={handleValidate}
            onSubmit={handleSubmit}
            onClose={onClose}
            title={title}
            form={selections.length > 0 ? renderForm : null}
            {...props}
        />
    );
};

AccountsDialog.propTypes = {
    onClose: PropTypes.func.isRequired,
    onExited: PropTypes.func.isRequired,
    show: PropTypes.bool.isRequired,
    title: PropTypes.string,
    institutionId: PropTypes.number.isRequired,
};

AccountsDialog.defaultProps = {
    title: 'Accounts',
};

const plaidConfig = {
    apiVersion: 'v2',
    clientName: process.env.APP_NAME,
    env: process.env.PLAID_ENV,
    product: process.env.PLAID_PRODUCTS.split(','),
    publicKey: process.env.PLAID_PUBLIC_KEY,
    countryCodes: process.env.PLAID_COUNTRY_CODES.split(','),
};

// const oauthRedirectUri = process.env.PLAID_OAUTH_REDIRECT_URI;
// if (oauthRedirectUri !== '') {
//     linkHandlerCommonOptions.oauthRedirectUri = oauthRedirectUri;
// }

// const oauthNonce = process.env.PLAID_OAUTH_NONCE;
// if (oauthNonce !== '') {
//     linkHandlerCommonOptions.oauthNonce = oauthNonce;
// }

function onSuccess(publicToken, metadata) {
    fetch('/institution', {
        method: 'POST',
        headers: {
            'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]').getAttribute('content'),
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ publicToken, institution: metadata.institution }),
    })
        .then(async (response) => {
            const json = await response.json();

            console.log(json);

            // let newInstitutionElement = createInstitutionElement({
            //     id: json.id, name: json.name, accounts: []
            // });

            // const institutionElements = $('#accounts > div');

            // for (const institutionElement of institutionElements) {
            //     const name = $(institutionElement).find('.institution-name').text();

            //     const compare = name.localeCompare(json.name);

            //     if (compare > 0) {
            //         newInstitutionElement.insertBefore(institutionElement);
            //         newInstitutionElement = null;
            //         break;
            //     }
            // }

            // if (newInstitutionElement !== null) {
            //     newInstitutionElement.appendTo('#accounts');
            // }

            // openAccountSelectionDialog(json.id, json.accounts);
        });
}

export { plaidConfig, onSuccess, AccountsDialog };
