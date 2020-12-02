import React from 'react';
import PropTypes from 'prop-types';
import { ModalLauncher } from '../Modal';
import IconButton from '../IconButton';
import AccountsDialog from './AccountsDialog';
import InstitutionInfoDialog from './InstitutionInfoDialog';
import Account from './Account';

function Institution({
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

Institution.propTypes = {
  institution: PropTypes.shape({
    id: PropTypes.number.isRequired,
    name: PropTypes.string.isRequired,
    accounts: PropTypes.arrayOf(PropTypes.shape()).isRequired,
  }).isRequired,
  onAccountSelected: PropTypes.func.isRequired,
  accountSelected: PropTypes.number,
  onRelink: PropTypes.func.isRequired,
};

Institution.defaultProps = {
  accountSelected: null,
};

export default Institution;
