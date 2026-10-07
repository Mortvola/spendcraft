import React from 'react';
import { useStores } from '../State/Store';
import PlaidLink from '../PlaidLink';
import { useNavigate } from 'react-router';
import Institution from '../AccountView/Institution';
import { observer } from 'mobx-react-lite';

const AddAccounts: React.FC = observer(() => {
  const { accounts } = useStores();
  const navigate = useNavigate();

  const addInstitution = () => {
    accounts.linkInstitution();
  };

  const finish = () => {
    navigate('/home');
  }

  const handleAccountSelected = () => {
    // Onboarding does not track the selected account.
  }

  const handleAccountStateChange = () => {
    // Onboarding always shows open accounts; no view state needs updating.
  }

  return (
    <>
      <button type="button" onClick={addInstitution}>Add Online Institution</button>
      <button type="button" onClick={finish}>Finish</button>

      <div>
        {
          accounts.institutions
            // .filter((institution) => (opened ? institution.hasOpenAccounts() : institution.hasClosedAccounts()))
            .map((institution) => (
              <Institution
                key={institution.id}
                institution={institution}
                onAccountSelected={handleAccountSelected}
                onAccountStateChange={handleAccountStateChange}
                // selectedAccount={uiState.selectedAccount}
                opened={true}
              />
            ))
        }
      </div>

      <PlaidLink />
    </>
  )
})

export default AddAccounts;
