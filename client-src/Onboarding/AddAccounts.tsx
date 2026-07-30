import React from 'react';
import { useStores } from '../State/Store';
import PlaidLink from '../PlaidLink';
import { useNavigate } from 'react-router';

const AddAccounts: React.FC = () => {
  const { accounts } = useStores();
  const navigate = useNavigate();

  const addInstitution = () => {
    accounts.linkInstitution();
  };

  const finish = () => {
    navigate('/home');
  }

  return (
    <>
      <button type="button" onClick={addInstitution}>Add Online Institution</button>
      <button type="button" onClick={finish}>Finish</button>
      <PlaidLink />
    </>
  )
}

export default AddAccounts;
