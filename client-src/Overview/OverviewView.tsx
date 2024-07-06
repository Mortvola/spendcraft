import React from 'react';
import { observer } from 'mobx-react-lite';
import { Outlet } from 'react-router-dom';
import { useStores } from '../State/Store';
import DesktopView from '../DesktopView';

const OverviewView = observer(() => {
  const { overview } = useStores();

  React.useEffect(() => {
    overview.load()
  })

  return (
    <DesktopView>
      <div>
        <Outlet />
      </div>
    </DesktopView>
  )
})

export default OverviewView;
