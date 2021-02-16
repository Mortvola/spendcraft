import React, { useContext } from 'react';
import { observer } from 'mobx-react-lite';
import Institution from './Institution';
import MobxStore from '../redux/mobxStore';

const AccountView = () => {
  const { accounts } = useContext(MobxStore);
  const { institutions, selectedAccount } = accounts;

  const handleAccountSelected = (account) => {
    accounts.selectAccount(account);
  };

  const handleRelink = (institutionId) => {
    accounts.relinkInstitution(institutionId);
  };

  return (
    <div id="accounts">
      {institutions.map((institution) => (
        <Institution
          key={institution.name}
          institution={institution}
          onAccountSelected={handleAccountSelected}
          selectedAccount={selectedAccount}
          onRelink={handleRelink}
        />
      ))}
    </div>
  );
};

export default observer(AccountView);
