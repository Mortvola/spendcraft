import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import {
  Outlet, matchPath, useLocation, useNavigate,
} from 'react-router';
import CategoryView from './CategoryView/CategoryView';
import HomeToolbar from './CategoryView/CategoryViewToolbar';
import styles from './Home.module.scss';
import Main from '../Main';
import DesktopView from '../DesktopView';
import MobileView from '../MobileView';
import NavigationView from '../NavigationView';
import TabViewMenu from '../TabView/TabViewMenu';
import { EllipsisVertical } from 'lucide-react';
import TabViewMenuItem from '../TabView/TabViewMenuItem';
import { useGroupDialog } from './CategoryView/GroupDialog';
import { useCategoryDialog } from './CategoryView/CategoryDialog';
import { useRebalanceDialog } from '../Rebalance/RebalanceDialog';
import { useFundingDialog } from '../Funding/FundingDialog';
import { CategoryType } from '../../common/ResponseTypes';

const Home: React.FC = observer(() => {
  const [open, setOpen] = useState<boolean>(false);
  const location = useLocation();
  const navigate = useNavigate();
  const [GroupDialog, showGroupDialog] = useGroupDialog();
  const [CategoryDialog, showCategoryDialog] = useCategoryDialog();
  const [BillDialog, showBillDialog] = useCategoryDialog();
  const [GoalDialog, showGoalDialog] = useCategoryDialog();
  const [RebalanceDialog, showRebalanceDialog] = useRebalanceDialog();
  const [FundingDialog, showFundingDialog] = useFundingDialog();

  React.useEffect(() => {
    const matched = matchPath({ path: '/home/:category', caseSensitive: false, end: true }, location.pathname);

    if (matched) {
      setOpen(true);
    }
    else {
      setOpen(false);
    }
  }, [location.pathname]);

  const handleClose = () => {
    navigate('/home');
  }

  const renderMenu = () => (
    <TabViewMenu
      icon={<EllipsisVertical size={24} strokeWidth={1} />}
    >
      <TabViewMenuItem onClick={showGroupDialog}>Add Group</TabViewMenuItem>
      <TabViewMenuItem onClick={showCategoryDialog}>Add Category</TabViewMenuItem>
      <TabViewMenuItem onClick={showBillDialog}>Add Bill</TabViewMenuItem>
      <TabViewMenuItem onClick={showGoalDialog}>Add Goal</TabViewMenuItem>
      <TabViewMenuItem onClick={showRebalanceDialog}>Rebalance</TabViewMenuItem>
      <TabViewMenuItem onClick={showFundingDialog}>Fund</TabViewMenuItem>
    </TabViewMenu>
  )

  return (
    <>
      <DesktopView>
        <Main
          toolbar={<HomeToolbar open={open} />}
          sidebar={(
            <CategoryView />
          )}
          className={styles.theme}
        >
          <Outlet />
        </Main>
      </DesktopView>
      
      <MobileView>
        <NavigationView
          title="Categories"
          open={open}
          onClose={handleClose}
          details={<Outlet />}
          menu={open ? undefined : renderMenu()}
        >
          <CategoryView />
        </NavigationView>
        <GroupDialog />
        <CategoryDialog />
        <BillDialog type={CategoryType.Bill} />
        <GoalDialog type={CategoryType.Goal} />
        <RebalanceDialog />
        <FundingDialog />
      </MobileView>
    </>
  );

  return null;
});

export default Home;
