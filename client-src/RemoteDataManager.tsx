import React from 'react';
import styles from './RemoteDataManager.module.scss';
import useDataPager from './DataPager';
import PleaseWait from './PleaseWait';

type PropsType = {
  onGetData?: () => Promise<void>,
  onGetMoreData?: () => Promise<void>,
  children: React.ReactNode,
  className?: string,
}

const RemoteDataManager: React.FC<PropsType> = ({
  onGetData,
  onGetMoreData,
  children,
  className,
}) => {
  const ref = React.useRef<HTMLDivElement>(null);
  const isDataNeeded = useDataPager();
  const [refreshing, setRefreshing] = React.useState<boolean>(false);
  const [fetching, setFetching] = React.useState<boolean>(false);
  const [loadingMore, setLoadingMore] = React.useState<boolean>(false);

  const handleScroll: React.UIEventHandler<HTMLDivElement> = () => {
    if (!loadingMore && onGetMoreData && isDataNeeded(ref.current)) {
      setLoadingMore(true);
      (async () => {
        await onGetMoreData();
        setLoadingMore(false);
      })()
    }

    const element = ref.current;

    if (onGetData && element) {
      if (element.scrollTop < -100 && !refreshing) {
        setRefreshing(true);
        setFetching(true);
        (async () => {
          await onGetData();
          setFetching(false);

          if (element.scrollTop >= 0) {
            setRefreshing(false);
          }
        })();
      }
      else if (refreshing && !fetching && element.scrollTop >= 0) {
        setRefreshing(false);
      }
    }
  }

  return (
    <div
      ref={ref}
      className={styles.pullRefresherWrapper}
      onScroll={handleScroll}
    >
      <div className={`${styles.pullRefresher} ${className ?? ''}`}>
        {
          refreshing
            ? (
              <div className={styles.refresh}>
                <PleaseWait />
              </div>
            )
            : null
        }
        {children}
        {
          loadingMore
            ? (
              <div className={styles.loadMore}>
                <PleaseWait />
              </div>
            )
            : null
        }
      </div>
    </div>
  )
};

export default RemoteDataManager;
