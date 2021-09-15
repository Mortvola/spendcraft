import React, { ReactElement, useState } from 'react';
import { observer } from 'mobx-react-lite';
import NetWorth from './NetWorth';
import Payee from './Payee';
import Category from './Category';
import Main from '../Main';
import styles from './Reports.module.css';
import useMediaQuery from '../MediaQuery'
import ReportList from './ReportList';

const Reports = (): ReactElement => {
  const [reportType, setReportType] = useState<string | null>(null);
  const [open, setOpen] = useState<boolean>(false);
  const { isMobile } = useMediaQuery();

  const handleToggleClick = () => {
    setOpen(!open);
  }

  const handleSelect = (value: string | null) => {
    setReportType(value);
    if (isMobile) {
      setOpen(false);
    }
  };

  const reports = [
    { value: 'netWorth', name: 'Net Worth' },
    { value: 'payee', name: 'Payee' },
    { value: 'category', name: 'Category' },
  ];

  const renderReport = (): ReactElement | null => {
    switch (reportType) {
      case 'netWorth':
        return <NetWorth />;

      case 'payee':
        return <Payee />;

      case 'category':
        return <Category />;

      default:
        return <div className="chart-wrapper window" />;
    }

    return null;
  };

  return (
    <Main
      open={open}
      sidebar={<ReportList reports={reports} onSelect={handleSelect} selectedValue={reportType} />}
      onToggleClick={handleToggleClick}
      className={styles.theme}
    >
      {renderReport()}
    </Main>
  );
};

export default observer(Reports);
