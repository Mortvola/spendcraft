import React from 'react';
import { observer } from 'mobx-react-lite';
import styles from './RemoteDataManager.module.scss';
import PleaseWait from './PleaseWait';
import { RemoteDataInterface } from './State/Types';

interface PropsType {
  data: RemoteDataInterface,
  children: React.ReactNode,
  className?: string,
}

const RemoteDataManager: React.FC<PropsType> = observer(({
  data,
  children,
  className,
}) => {
  const ref = React.useRef<HTMLDivElement>(null);
  // const [refreshing, setRefreshing] = React.useState<boolean>(false);
  // const [fetching, setFetching] = React.useState<boolean>(false);
  // const [loadingMore, setLoadingMore] = React.useState<boolean>(false);

  const isDataNeeded = (element: HTMLDivElement | null): boolean => {
    if (element !== null) {
      const { scrollTop, scrollHeight, clientHeight } = element;

      // When we are a page away from the bottom then get more data.
      return (scrollTop > scrollHeight - 2 * clientHeight);
    }

    return false;
  };

  const handleScroll: React.UIEventHandler<HTMLDivElement> = () => {
    const element = ref.current;

    if (element) {
      if (data.state() === 'IDLE' && !data.isComplete() && isDataNeeded(element)) {
        (async () => {
          await data.getMoreData();
        })()
      }

      if (element) {
        // Handle pull to refresh
        if (element.scrollTop < -100 && data.state() === 'IDLE') {
          (async () => {
            await data.getData(0);

            // if (element.scrollTop >= 0) {
            //   setRefreshing(false);
            // }
          })();
        }
        // else if (refreshing && !fetching && element.scrollTop >= 0) {
        //   setRefreshing(false);
        // }
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
          data.state() === 'LOADING'
            ? (
              <div className={styles.refresh}>
                <PleaseWait />
              </div>
            )
            : null
        }
        {children}
        {
          data.state() === 'LOADING-MORE'
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
});

export default RemoteDataManager;
