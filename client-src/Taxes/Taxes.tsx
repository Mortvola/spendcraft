import React from 'react';
import { Outlet } from 'react-router';
import DesktopView from '../DesktopView';
import MobileView from '../MobileView';
import ViewTitle from '../ViewTitle';

const Taxes: React.FC = () => (
  <>
    <DesktopView>
      <div>
        <Outlet />
      </div>
    </DesktopView>

    <MobileView>
      <div>
        <ViewTitle>Taxes</ViewTitle>
        <Outlet />
      </div>
    </MobileView>
  </>
)

export default Taxes;
