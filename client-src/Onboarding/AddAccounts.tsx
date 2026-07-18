import React from 'react';
import { useStores } from '../State/Store';
import PlaidLink from '../PlaidLink';

const AddAccounts: React.FC = () => {
  const { accounts } = useStores();

  const addInstitution = () => {
    accounts.linkInstitution();
  };

  return (
    <>
      <button type="button" onClick={addInstitution}>Add Online Institution</button>
      <PlaidLink />
    </>
  )
}

export default AddAccounts;
