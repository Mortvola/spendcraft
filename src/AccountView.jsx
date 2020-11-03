import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import moment from 'moment';
import IconButton from './IconButton';
import {
  receiveCategoryBalances,
  selectAccount,
  relinkInstitution,
  accountSynced,
} from './redux/actions';
import AccountsDialog from './AccountsDialog';
import { ModalLauncher } from './Modal';
import InstitutionInfoDialog from './InstitutionInfoDialog';
import { formatNumber } from './NumberFormat';

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

  const handleRelink = (institutionId) => {
    dispatch(relinkInstitution(institutionId));
  };

  return (
    <div id="accounts">
      {institutions.map((institution) => (
        <InstitutionElement
          key={institution.name}
          institution={institution}
          onAccountSelected={handleAccountSelected}
          accountSelected={selectedAccount}
          onRelink={handleRelink}
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

function InstitutionElement({
  institution,
  onAccountSelected,
  accountSelected,
  onRelink,
}) {
  const handleRelinkClick = () => {
    onRelink(institution.id);
  };

  return (
    <div>
      <div className="acct-list-inst">
        <div className="institution-name">{institution.name}</div>
        <ModalLauncher
          launcher={(props) => (<IconButton icon="plus" {...props} />)}
          dialog={(props) => (
            <AccountsDialog {...props} institutionId={institution.id} />
          )}
        />
        <IconButton icon="link" onClick={handleRelinkClick} />
        <ModalLauncher
          launcher={(props) => (<IconButton icon="info-circle" {...props} />)}
          dialog={(props) => (
            <InstitutionInfoDialog institutionId={institution.id} {...props} />
          )}
        />
      </div>
      <div>
        {institution.accounts.map((account) => (
          <Account
            key={account.id}
            institutionId={institution.id}
            account={account}
            onAccountSelected={onAccountSelected}
            selected={accountSelected === account.id}
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
    accounts: PropTypes.arrayOf(PropTypes.shape()).isRequired,
  }).isRequired,
  onAccountSelected: PropTypes.func.isRequired,
  accountSelected: PropTypes.number,
  onRelink: PropTypes.func.isRequired,
};

InstitutionElement.defaultProps = {
  accountSelected: undefined,
};

const Account = connect()(({
  selected,
  institutionId,
  account,
  dispatch,
  ...props
}) => {
  const [refreshing, setRefreshing] = useState(false);

  const refresh = () => {
    setRefreshing(true);

    fetch(`/institution/${institutionId}/accounts/${account.id}/transactions/sync`, {
      method: 'POST',
      headers:
      {
        'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]').getAttribute('content'),
      },
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Request failed: ${response.status}`);
        }
        setRefreshing(false);
        return response.json();
      })
      .then((json) => {
        const { categories, accounts } = json;
        if (categories && categories.length > 0) {
          dispatch(receiveCategoryBalances(categories));
        }

        if (accounts) {
          dispatch(accountSynced(
            institutionId, account.id, accounts[0].balance, accounts[0].syncDate,
          ));
        }
      })
      .catch((error) => {
        console.log(error);
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

  let balance = formatNumber(account.balance);
  if (account.syncDate) {
    balance += ` as of ${moment.utc(account.syncDate).local().format('M-D-YY HH:mm:ss')}`;
  }

  return (
    <div className="acct-list-item">
      <IconButton icon="sync-alt" rotate={rotate} onClick={refresh} />
      <div>
        <div className={className} onClick={accountSelected}>{account.name}</div>
        <div className="acct-balance">{balance}</div>
      </div>
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
