import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import IconButton from './IconButton';
import { receiveCategoryBalances } from './redux/actions';
import { AccountsDialog } from './Accounts';
import { ModalLauncher } from './Modal';

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
    const relinkAccount = () => {
        fetch(`/institution/${institution.id}/public_token`)
            .then((response) => {
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
                <ModalLauncher
                    launcher={(props) => (<IconButton icon="plus" {...props} />)}
                    dialog={(props) => (<AccountsDialog {...props} institutionId={institution.id} />)}
                />
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

const Account = connect()(({
    selected,
    account,
    dispatch,
    ...props
}) => {
    const [refreshing, setRefreshing] = useState(false);

    const refresh = () => {
        setRefreshing(true);

        fetch(`/institution/${props.institutionId}/accounts/${account.id}/transactions/sync`, {
            method: 'POST',
            headers:
            {
                'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]').getAttribute('content'),
                'Content-Type': 'application/json',
            },
        })
            .then(
                (response) => response.json(),
                (error) => console.log('fetch error: ', error),
            )
            .then((json) => {
                const { categories } = json;
                if (categories && categories.length > 0) {
                    dispatch(receiveCategoryBalances(categories));
                }

                document.dispatchEvent(new Event('accountRefreshed'));
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
});

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
