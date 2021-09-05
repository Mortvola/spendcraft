import React, { ReactElement, useContext } from 'react';
import { observer } from 'mobx-react-lite';
import { Nav } from 'react-bootstrap';
import NetWorth from './NetWorth';
import MobxStore from '../state/mobxStore';
import Payee from './Payee';
import { isNetworthReport, isPayeeReport } from '../state/Reports';

const Reports = (): ReactElement => {
  const { reports } = useContext(MobxStore);
  const { reportType, data } = reports;

  const handleSelect = (eventKey: string | null) => {
    if (eventKey) {
      reports.loadReport(eventKey);
    }
  };

  const renderReport = (): ReactElement | null => {
    switch (reportType) {
      case 'netWorth':
        if (isNetworthReport(data)) {
          return <NetWorth balances={data} />;
        }

        break;

      case 'payee':
        if (isPayeeReport(data)) {
          return <Payee data={data} />;
        }

        break;

      default:
        return <div className="chart-wrapper window" />;
    }

    return null;
  };

  return (
    <>
      <div className="side-bar window">
        <Nav className="flex-column" onSelect={handleSelect}>
          <Nav.Link eventKey="netWorth">Net Worth</Nav.Link>
          <Nav.Link eventKey="payee">Payee</Nav.Link>
        </Nav>
      </div>
      {renderReport()}
    </>
  );
};

export default observer(Reports);
