import React from 'react';
import { observer } from 'mobx-react-lite';
import { Outlet } from 'react-router-dom';
import { useStores } from '../State/Store';
import DesktopView from '../DesktopView';
import AutoAssigmentsToolbar from './AutoAssignmentsToolbar';
import MobileView from '../MobileView';
import ViewTitle from '../ViewTitle';

const AutoAssigments = observer(() => {
  const { autoAssignments } = useStores();

  React.useEffect(() => {
    autoAssignments.load()
  })

  return (
    <>
      <DesktopView>
        <div>
          <AutoAssigmentsToolbar />
          <Outlet />
        </div>
      </DesktopView>

      <MobileView>
        <div>
          <AutoAssigmentsToolbar />
          <ViewTitle>Auto Assignments</ViewTitle>
          <Outlet />
        </div>
      </MobileView>
    </>
  )
})

export default AutoAssigments;
