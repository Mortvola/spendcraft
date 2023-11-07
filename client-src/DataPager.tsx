import React from 'react';

const useDataPager = (): (element: HTMLDivElement | null) => boolean => {
  const isDataNeeded = React.useCallback((element: HTMLDivElement | null): boolean => {
    if (element !== null) {
      const { scrollTop, scrollHeight, clientHeight } = element;

      if (scrollTop >= 0) {
      // window.requestAnimationFrame(() => {
        const scrollBottom = scrollHeight - (scrollTop + clientHeight);
        const pagesLeft = scrollBottom / clientHeight;

        return (pagesLeft <= 0.3);
      }
      // })
    }

    return false;
  }, []);

  return isDataNeeded;
};

export default useDataPager;
