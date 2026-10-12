import React, { useEffect, useState } from 'react';
import NetworthContent from './NetworthContent';
import Http from '@mortvola/http';

import { isNetworthReport } from '../../common/ResponseTypes';

const Networth: React.FC = () => {
  const [data, setData] = useState<(number | string)[][] | null>(null);

  useEffect(() => {
    (async () => {
      const response = await Http.get('/api/v1/reports/networth');

      if (response.ok) {
        const body = await response.body();

        if (isNetworthReport(body)) {
          // Append the networth data to the end of each row of the table.
          body.forEach((a, index) => {
            if (index === 0) {
              a.splice(a.length, 0, 'Net Worth');
            }
            else {
              a.splice(a.length, 0, a.reduce((accum, balance) => {
                if (typeof balance === 'string') {
                  return accum;
                }

                if (typeof accum === 'string') {
                  throw new Error('accumulator is a string');
                }

                return accum + balance;
              }, 0))
            }
          })
          setData(body);
        }
      }
    })();
  }, []);

  return <NetworthContent data={data} />;
};


export default Networth;
