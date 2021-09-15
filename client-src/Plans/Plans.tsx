import React, { useContext, useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import PlanDetails from './PlanDetails';
import MobxStore from '../State/mobxStore';
import PlanList from './PlanList';
import PlansToolbar from './PlansToolbar';
import Main from '../Main';
import Sidebar from '../Sidebar';
import useMediaQuery from '../MediaQuery'
import styles from './Plans.module.css'

const Plans = () => {
  const { plans, uiState } = useContext(MobxStore);
  const [open, setOpen] = useState<boolean>(false);
  const { isMobile } = useMediaQuery();

  useEffect(() => {
    plans.load();
  }, [plans]);

  useEffect(() => {
    if (uiState.selectedPlan !== null) {
      plans.loadDetails(uiState.selectedPlan);
    }
  }, [plans, uiState.selectedPlan]);

  const handleSelect = () => {
    if (isMobile) {
      setOpen(false);
    }
  };

  const handleToggleClick = () => {
    setOpen(!open);
  }

  return (
    <Main toolbar={<PlansToolbar />} onToggleClick={handleToggleClick} className={styles.theme}>
      <Sidebar open={open} className={styles.theme}>
        <PlanList plans={plans.list} selected={uiState.selectedPlan} onSelect={handleSelect} />
      </Sidebar>
      <PlanDetails />
    </Main>
  );
};

export default observer(Plans);
