import React from 'react';
import PropTypes from 'prop-types';
import { observer } from 'mobx-react-lite';
import IconButton from '../IconButton';
import { useAccountsDialog } from './AccountsDialog';
import { useInstitutionInfoDialog } from './InstitutionInfoDialog';
import Account from './Account';

function Institution({
  institution,
  onAccountSelected,
  selectedAccount,
  onRelink,
}) {
  const [AccountsDialog, showAccountsDialog] = useAccountsDialog();
  const [InstitutionInfoDialog, showInstitutionInfoDialog] = useInstitutionInfoDialog();
  const handleRelinkClick = () => {
    onRelink(institution.id);
  };

  return (
    <div className="inst-card">
      <div className="acct-list-inst">
        <div className="institution-name">{institution.name}</div>
        <IconButton icon="plus" onClick={showAccountsDialog} />
        <AccountsDialog institution={institution} />
        <IconButton icon="link" onClick={handleRelinkClick} />
        <IconButton icon="info-circle" onClick={showInstitutionInfoDialog} />
        <InstitutionInfoDialog institution={institution} />
      </div>
      <div className="acct-list-accounts">
        {
          institution.accounts.map((account) => {
            const selected = selectedAccount
              ? selectedAccount.id === account.id
              : false;

            return (
              <Account
                key={account.id}
                institutionId={institution.id}
                account={account}
                onAccountSelected={onAccountSelected}
                selected={selected}
              />
            );
          })
        }
      </div>
    </div>
  );
}

Institution.propTypes = {
  institution: PropTypes.shape({
    id: PropTypes.number.isRequired,
    name: PropTypes.string.isRequired,
    accounts: PropTypes.arrayOf(PropTypes.shape()).isRequired,
  }).isRequired,
  onAccountSelected: PropTypes.func.isRequired,
  selectedAccount: PropTypes.shape(),
  onRelink: PropTypes.func.isRequired,
};

Institution.defaultProps = {
  selectedAccount: null,
};

export default observer(Institution);
