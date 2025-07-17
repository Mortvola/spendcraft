import { observer } from 'mobx-react-lite';
import React from 'react';
import { useStores } from './State/Store';
import Signin from './Credentials/Signin';

interface PropsType {
  children: React.ReactNode,
}

const RequireAuth: React.FC<PropsType> = observer(({ children }) => {
  const store = useStores();

  if (!store.user.authenticated) {
    return (
      <Signin />
    )
  }

  return (
    <>
      {children}
    </>
  );
})

export default RequireAuth;
