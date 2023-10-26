import React from 'react';
import { runInAction } from 'mobx';
import { PlaidLinkOnSuccessMetadata, usePlaidLink } from 'react-plaid-link';
import { useStores } from './State/mobxStore';
import Console from './Console';
import { InstitutionInterface } from './State/State';

type PropsType = {
  institution?: InstitutionInterface,
}

const PlaidLinkDialog: React.FC<PropsType> = ({
  institution,
}) => {
  const { uiState, accounts } = useStores();

  const onEvent = (eventName: string) => {
    Console.log(`plaid event: ${eventName}`);
    // if (eventName === 'HANDOFF') {
    //   runInAction(() => {
    //     uiState.plaid = null;
    //   });
    // }
  };

  const onExit = React.useCallback((err: unknown, metaData: unknown) => {
    if (err) {
      Console.log(err);
      Console.log(JSON.stringify(metaData));
    }

    runInAction(() => {
      uiState.plaid = null;
    });
  }, [uiState]);

  const onSuccess = React.useCallback(async (publicToken: string, metadata: PlaidLinkOnSuccessMetadata) => {
    if (uiState.plaid === null) {
      throw new Error('plaid is null');
    }

    if (publicToken) {
      if (!metadata.institution) {
        throw new Error('metadata.institution is null');
      }

      if (institution) {
        await institution.update();
      }
      else {
        await accounts.addInstitution(
          publicToken, metadata,
        );
      }
    }

    runInAction(() => {
      uiState.plaid = null;
    });
  }, [accounts, institution, uiState]);

  const { open, ready } = usePlaidLink({
    token: uiState.plaid.linkToken,
    onSuccess,
    onExit,
    onEvent,
  });

  React.useEffect(() => {
    if (uiState.plaid && open && ready) {
      open();
    }
  }, [uiState.plaid, open, ready]);

  return null;
};

export default PlaidLinkDialog;
