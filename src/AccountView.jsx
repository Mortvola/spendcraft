import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import IconButton from './IconButton';

const mapStateToProps = (state) => ({
    intitutions: state.institutions,
});

const AccountView = connect(mapStateToProps)(({
    intitutions,
    onAccountSelected,
    accountSelected,
}) => (
    <div id="accounts">
        {intitutions.map((institution) => (
            <InstitutionElement
                key={institution.name}
                institution={institution}
                onAccountSelected={onAccountSelected}
                accountSelected={accountSelected}
            />
        ))}
    </div>
));

AccountView.propTypes = {
    onAccountSelected: PropTypes.func.isRequired,
    accountSelected: PropTypes.number,
};

AccountView.defaultProps = {
    accountSelected: undefined,
};

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
    accountSelected: undefined,
};

function Account({ selected, account, ...props }) {
    const [refreshing, setRefreshing] = useState(false);

    const refresh = () => {
        setRefreshing(true);

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
                setRefreshing(false);
            });
    };

    const accountSelected = () => {
        props.onAccountSelected(account.id);
    };

    let className = 'acct-list-acct';
    if (selected) {
        className += ' selected';
    }

    let rotate = false;
    if (refreshing) {
        rotate = true;
    }

    return (
        <div className="acct-list-item">
            <IconButton icon="sync-alt" rotate={rotate} onClick={refresh} />
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
