import { observer } from 'mobx-react-lite';
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useStores } from './State/mobxStore';

type PropsType = {
  children: React.ReactNode,
}

const RequireAuth: React.FC<PropsType> = observer(({ children }) => {
  const store = useStores();
  const location = useLocation();

  if (!store.user.authenticated) {
    return <Navigate to="/signin" state={{ from: location }} replace />;
  }

  return (
    // eslint-disable-next-line react/jsx-no-useless-fragment
    <>
      {children}
    </>
  );
})

export default RequireAuth;
