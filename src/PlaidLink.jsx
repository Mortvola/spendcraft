import { useEffect, useCallback, useContext } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import MobxStore from './redux/mobxStore';

const PlaidLink = () => {
  const { accounts } = useContext(MobxStore);

  const onExit = useCallback((err, metaData) => {
    if (err) {
      console.log(err);
      console.log(JSON.stringify(metaData));
    }
    accounts.plaid.hideDialog();
  }, [accounts.plaid]);

  const onSuccess = useCallback((publicToken, metadata) => {
    if (publicToken && !accounts.plaid.updateMode) {
      accounts.addInstitution(publicToken, metadata);
      accounts.plaid.hideDialog();
    }
  }, [accounts]);

  const { open, ready } = usePlaidLink({
    token: accounts.plaid.linkToken,
    onSuccess,
    onExit,
  });

  useEffect(() => {
    if (accounts.plaid.displayDialog && open && ready) {
      open();
    }
  }, [accounts.plaid.displayDialog, open, ready]);

  return null;
};

export default PlaidLink;
