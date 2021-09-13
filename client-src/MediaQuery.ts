import * as responsive from 'react-responsive';

type MediaQueryType = {
  isDesktop: boolean,
  isMobile: boolean,
}

const useMediaQuery = (): MediaQueryType => {
  const isDesktop = responsive.useMediaQuery({ query: '(min-width: 1224px)' })
  const isMobile = responsive.useMediaQuery({ query: '(max-width: 1224px)' })

  return { isDesktop, isMobile };
}

export default useMediaQuery;
