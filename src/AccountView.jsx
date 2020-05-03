import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import IconButton from './IconButton';

function AccountView(props) {
    const [accounts, setAccounts] = useState([]);
    const [initialized, setInitialized] = useState(false);

    useEffect(() => {
        if (!initialized) {
            setInitialized(true);
            $.getJSON({
                url: '/connected_accounts',
            })
                .done((response) => {
                    setAccounts(response);
                });
        }
    }, [initialized]);

    return (
        <div id="accounts">
            {accounts.map((institution) => (
                <InstitutionElement
                    key={institution.name}
                    institution={institution}
                    onAccountSelected={props.onAccountSelected}
                    accountSelected={props.accountSelected}
                />
            ))}
        </div>
    );
}

AccountView.propTypes = {
    onAccountSelected: PropTypes.func.isRequired,
    accountSelected: PropTypes.number,
};

AccountView.defaultProps = {
    accountSelected: undefined,
}

function InstitutionElement({ institution, ...props }) {
    const addAccount = () => {
        $.getJSON({
            url: `/institution/${institution.id}/accounts`,
        })
            .done((response) => {
                openAccountSelectionDialog(institution.id, response);
            });
    };

    const relinkAccount = () => {
        $.getJSON({
            url: `/institution/${institution.id}/public_token`,
        })
            .done((response) => {

                const handler = Plaid.create({
                    ...linkHandlerCommonOptions,
                    token: response.publicToken,
                    onSuccess(public_token, metadata) {},
                    onExit(err, metadata) {},
                });
                handler.open();
            });
    };

    return (
        <div>
            <div className="acct-list-inst">
                <div className="institution-name">{institution.name}</div>
                <IconButton icon="plus" onClick={addAccount} />
                <IconButton icon="lock" onClick={relinkAccount} />
            </div>
            <div>
                {institution.accounts.map((account) => (
                    <Account
                        key={account.id}
                        institutionId={institution.id}
                        account={account}
                        onAccountSelected={props.onAccountSelected}
                        selected={props.accountSelected === account.id}
                    />
                ))}
            </div>
        </div>
    );
}

InstitutionElement.propTypes = {
    institution: PropTypes.shape({
        id: PropTypes.number.isRequired,
        name: PropTypes.string.isRequired,
        accounts: PropTypes.array.isRequired,
    }).isRequired,
    onAccountSelected: PropTypes.func.isRequired,
    accountSelected: PropTypes.number,
};

InstitutionElement.defaultProps = {
    accountSelected: undefined
}

function Account({ selected, account, ...props }) {
    const refresh = () => {
        refresh.children('i').addClass('rotate');

        $.post({
            url: `/institution/${props.institutionId}/accounts/${account.id}/transactions/sync`,
            headers:
            {
                'X-CSRF-TOKEN': $('meta[name="csrf-token"]').attr('content'),
            },
            contentType: 'application/json',
        })
            .done((response) => {
                if (response && response.categories && response.categories.length > 0) {
                    updateCategory(response.categories[0].id, response.categories[0].amount);
                }

                document.dispatchEvent(new Event('accountRefreshed'));
            })
            .always(() => {
                refresh.children('i').removeClass('rotate');
            });
    };

    const accountSelected = () => {
        props.onAccountSelected(account.id);
    };

    let className = 'acct-list-acct';
    if (selected) {
        className += ' selected';
    }

    return (
        <div className="acct-list-item">
            <IconButton icon="sync-alt" onClick={refresh} />
            <div className={className} onClick={accountSelected}>{account.name}</div>
        </div>
    );
}

Account.propTypes = {
    institutionId: PropTypes.number.isRequired,
    account: PropTypes.shape({
        name: PropTypes.string.isRequired,
        id: PropTypes.number.isRequired,
    }).isRequired,
    onAccountSelected: PropTypes.func.isRequired,
    selected: PropTypes.bool.isRequired,
};

export default AccountView;
