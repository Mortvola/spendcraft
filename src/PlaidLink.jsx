import { useEffect, useCallback } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import { hidePlaidLink, addInstitution } from './redux/actions';

const PlaidLink = ({
  linkToken,
  updateMode,
  dispatch,
}) => {
  const onExit = useCallback((err, metaData) => {
    if (err) {
      console.log(err);
      console.log(JSON.stringify(metaData));
    }
    dispatch(hidePlaidLink());
  }, []);

  const onSuccess = useCallback((publicToken, metadata) => {
    if (publicToken && !updateMode) {
      fetch('/institution', {
        method: 'POST',
        headers: {
          'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]').getAttribute('content'),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          publicToken,
          institution: metadata.institution,
        }),
      })
        .then(async (response) => {
          const json = await response.json();

          dispatch(addInstitution({ id: json.id, name: json.name, accounts: [] }));

          // openAccountSelectionDialog(json.id, json.accounts);
        });
    }
    dispatch(hidePlaidLink());
  }, []);

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
    onExit,
  });

  useEffect(() => {
    if (open && ready) {
      open();
    }
  }, [open, ready]);

  return null;
};

export default PlaidLink;
