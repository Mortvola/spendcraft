import React, { useContext } from 'react';
import { observer } from 'mobx-react-lite';
import { Nav } from 'react-bootstrap';
import NetWorth from './NetWorth';
import MobxStore from '../redux/mobxStore';

const Reports = () => {
  const { reports } = useContext(MobxStore);
  const { reportType, data } = reports;

  const handleSelect = (eventKey) => {
    reports.loadReport(eventKey);
  };

  const renderReport = () => {
    switch (reportType) {
      case 'netWorth':
        return <NetWorth balances={data} />;
      default:
        return null;
    }
  };

  return (
    <>
      <div className="side-bar">
        <Nav className="flex-column" onSelect={handleSelect}>
          <Nav.Link eventKey="netWorth">Net Worth</Nav.Link>
        </Nav>
      </div>
      {renderReport()}
    </>
  );
};

export default observer(Reports);
