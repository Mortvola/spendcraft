import React, { ReactElement, useState } from 'react';
import { observer } from 'mobx-react-lite';
import NetWorth from './NetWorth';
import Payee from './Payee';
import Category from './Category';
import Main from '../Main';
import styles from './Reports.module.scss';
import useMediaQuery from '../MediaQuery'
import ReportList from './ReportList';
import IncomeVsExpenses from './IncomeVsExpenses';
import FundingHistory from './FundingHistory';
import BudgetProgress from './BudgetProgress';

type ReportTypes = 'netWorth' | 'payee' | 'category' | 'incomeVsExpenses' | 'fundingHistory' | 'budgetProgress';

const Reports: React.FC = observer(() => {
  const [reportType, setReportType] = useState<ReportTypes | null>(null);
  const [open, setOpen] = useState<boolean>(false);
  const { isMobile } = useMediaQuery();

  const handleToggleClick = () => {
    setOpen(!open);
  }

  const handleSelect = (value: string | null) => {
    setReportType(value as ReportTypes);
    if (isMobile) {
      setOpen(false);
    }
  };

  const reports: { value: ReportTypes, name: string }[] = [
    { value: 'netWorth', name: 'Net Worth' },
    { value: 'payee', name: 'Payee' },
    { value: 'category', name: 'Category' },
    { value: 'incomeVsExpenses', name: 'Income Vs. Expenses' },
    { value: 'fundingHistory', name: 'Funding History' },
    { value: 'budgetProgress', name: 'Budget Progress' },
  ];

  const renderReport = (): ReactElement | null => {
    switch (reportType) {
      case 'netWorth':
        return <NetWorth />;

      case 'payee':
        return <Payee />;

      case 'category':
        return <Category />;

      case 'incomeVsExpenses':
        return <IncomeVsExpenses />

      case 'fundingHistory':
        return <FundingHistory />

      case 'budgetProgress':
        return <BudgetProgress />

      default:
        return <div className="chart-wrapper window window1" />;
    }

    return null;
  };

  return (
    <Main
      sidebar={<ReportList reports={reports} onSelect={handleSelect} selectedValue={reportType} />}
      onToggleClick={handleToggleClick}
      className={styles.theme}
    >
      {renderReport()}
    </Main>
  );
});

export default Reports;
