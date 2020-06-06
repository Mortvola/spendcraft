import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import IconButton from './IconButton';
import {
    receiveCategoryBalances,
    selectAccount,
} from './redux/actions';
import { AccountsDialog } from './AccountsDialog';
import { ModalLauncher } from './Modal';
import InstitutionInfoDialog from './InstitutionInfoDialog';

const mapStateToProps = (state) => ({
    institutions: state.institutions,
    selectedAccount: state.selections.selectedAccountId,
});

const AccountView = ({
    institutions,
    selectedAccount,
    dispatch,
}) => {
    const handleAccountSelected = (accountId, tracking) => {
        dispatch(selectAccount(accountId, tracking));
    };

    return (
        <div id="accounts">
            {institutions.map((institution) => (
                <InstitutionElement
                    key={institution.name}
                    institution={institution}
                    onAccountSelected={handleAccountSelected}
                    accountSelected={selectedAccount}
                />
            ))}
        </div>
    );
};

AccountView.propTypes = {
    institutions: PropTypes.arrayOf(PropTypes.shape()),
    dispatch: PropTypes.func.isRequired,
    selectedAccount: PropTypes.number,
};

AccountView.defaultProps = {
    institutions: [],
    selectedAccount: undefined,
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
                <ModalLauncher
                    launcher={(props) => (<IconButton icon="info-circle" {...props} />)}
                    dialog={(props) => (<InstitutionInfoDialog institutionId={institution.id} {...props} />)}
                />
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
        props.onAccountSelected(account.id, account.tracking);
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

export default connect(mapStateToProps)(AccountView);
