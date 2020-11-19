import React from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import {
  selectAccount,
  relinkInstitution,
} from './redux/actions';
import Institution from './Institution';

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
        <Institution
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

export default connect(mapStateToProps)(AccountView);
