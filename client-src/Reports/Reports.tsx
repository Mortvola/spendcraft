import React, { ReactElement, useContext, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Nav } from 'react-bootstrap';
import NetWorth from './NetWorth';
import Payee from './Payee';
import Category from './Category';

const Reports = (): ReactElement => {
  const [reportType, setReportType] = useState<string | null>(null);

  const handleSelect = (eventKey: string | null) => {
    setReportType(eventKey);
  };

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
    <>
      <div className="side-bar window">
        <Nav className="flex-column" onSelect={handleSelect}>
          <Nav.Link eventKey="netWorth">Net Worth</Nav.Link>
          <Nav.Link eventKey="payee">Payee</Nav.Link>
          <Nav.Link eventKey="category">Category</Nav.Link>
        </Nav>
      </div>
      {renderReport()}
    </>
  );
};

export default observer(Reports);
