import React from 'react';
import { TransactionContainerInterface } from '../State/State';

const useTrxPager = (trxContainer?: TransactionContainerInterface): (element: HTMLDivElement | null) => void => {
  const checkForNeededData = React.useCallback((element: HTMLDivElement | null) => {
    if (element !== null) {
      const { scrollTop, scrollHeight, clientHeight } = element;

      window.requestAnimationFrame(() => {
        const scrollBottom = scrollHeight - (scrollTop + clientHeight);
        const pagesLeft = scrollBottom / clientHeight;
        // console.log(
        //   `scrollHeight: ${scrollHeight}, scrollTop: ${scrollTop}, `
        //   + `clientHeight: ${clientHeight}, pagesLeft: ${pagesLeft}`,
        // );
        // if (transactions) {
        //   const pixelsPerItem = scrollHeight / transactions.length;
        //   const itemsPerPage = clientHeight / pixelsPerItem;
        //   console.log(`items per page: ${itemsPerPage}`);
        // }

        if (pagesLeft <= 0.3) {
          // Query for next set of records
          trxContainer?.getMoreTransactions();
        }
      })
    }
  }, [trxContainer]);

  return checkForNeededData;
};

export default useTrxPager;
