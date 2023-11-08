import React from 'react';

const useDataPager = (): (element: HTMLDivElement | null) => boolean => {
  const isDataNeeded = React.useCallback((element: HTMLDivElement | null): boolean => {
    if (element !== null) {
      const { scrollTop, scrollHeight, clientHeight } = element;

      // When we are a page away from the bottom then get more data.
      return (scrollTop > scrollHeight - 2 * clientHeight);
    }

    return false;
  }, []);

  return isDataNeeded;
};

export default useDataPager;
