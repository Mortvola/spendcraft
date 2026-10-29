import { decodeNetworthReport, networthTotals, type NetworthCentsReport } from '../monetary';
import React, { useEffect, useState } from 'react';
import NetworthContent from './NetworthContent';
import Http from '@mortvola/http';

import { isNetworthReport } from '../../common/ResponseTypes';

const Networth: React.FC = () => {
  const [data, setData] = useState<NetworthCentsReport | null>(null);

  useEffect(() => {
    (async () => {
      const response = await Http.get('/api/v1/reports/networth');

      if (response.ok) {
        const body = await response.body();

        if (isNetworthReport(body)) {
          setData(networthTotals(decodeNetworthReport(body)));
        }
      }
    })();
  }, []);

  return <NetworthContent data={data} />;
};


export default Networth;
