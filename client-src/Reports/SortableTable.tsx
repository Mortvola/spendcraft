import React, {
  CSSProperties,
  ReactElement, ReactNode, useMemo, useState,
} from 'react';
import Icon from '../Icon';
import styles from './SortableTable.module.scss';

interface SortableTableHeaderProps {
  className?: string,
  children?: ReactNode,
}

interface SortableColumnProps {
  column: string,
  className?: string,
  style?: CSSProperties,
  children?: ReactNode,
}

interface SortableTableProps {
  children: ReactNode,
}

interface SortableBodyProps<T> {
  className?: string,
  style?: CSSProperties,
  children: (r: T) => ReactElement,
}

interface UseSortableTableType<T> {
  setData: (data: (T & Record<string, unknown>)[]) => void,
  SortableTable: {
    (props: SortableTableProps): ReactElement,
    Header: (props: SortableTableHeaderProps) => ReactElement,
    Column: (props: SortableColumnProps) => ReactElement,
    Body: (prosp: SortableBodyProps<T>) => ReactElement,
  }
}

export default function useSortableTable<T>(keyPrecedence?: string[] | undefined): UseSortableTableType<T> {
  type Direction = 'ascending' | 'descending';

  interface SortConfig {
    column: string,
    direction: Direction,
  }

  const [data, setData] = useState<(T & Record<string, unknown>)[]>([]);
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(() => {
    if (keyPrecedence !== undefined) {
      return { column: keyPrecedence[0], direction: 'ascending' };
    }

    return null;
  });

  const sorted = useMemo(() => {
    const sortedData = data.slice();
    if (sortConfig !== null && sortedData !== null) {
      const compare2 = (
        a: T & Record<string, unknown>,
        b: T & Record<string, unknown>,
        key: string,
      ): number => {
        let value = 0;
        const x = a[key];
        const y = b[key];

        if (typeof x === 'number' && typeof y === 'number') {
          value = sortConfig.direction === 'ascending' ? x - y : y - x;
        }
        else if (typeof x === 'string' && typeof y === 'string') {
          if (sortConfig.direction === 'ascending') {
            value = x.localeCompare(y)
          }
          else {
            value = y.localeCompare(x)
          }
        }

        return value;
      }

      sortedData.sort(
        (
          a: T & Record<string, unknown>,
          b: T & Record<string, unknown>,
        ): number => {
          let value = 0;

          value = compare2(a, b, sortConfig.column);

          if (keyPrecedence) {
            let index = 0;
            while (value === 0 && index <= keyPrecedence.length - 1) {
              if (sortConfig.column !== keyPrecedence[index]) {
                value = compare2(a, b, keyPrecedence[index]);
              }

              index += 1;
            }
          }

          return value;
        },
      );
    }

    return sortedData;
  }, [data, keyPrecedence, sortConfig]);

  const processTitleClick = (column: string) => {
    let direction: Direction = 'ascending';
    if (sortConfig !== null && sortConfig.column === column) {
      direction = sortConfig.direction === 'ascending' ? 'descending' : 'ascending';
    }

    setSortConfig({ column, direction });
  }

  const SortableTable = ({
    children,
  }: SortableTableProps): ReactElement => (
    <div className={styles.tableWrapper}>
      <div className={styles.table}>
        {children}
      </div>
    </div>
  )

  const SortableTableHeader = ({
    className,
    children,
  }: SortableTableHeaderProps): ReactElement => (
    <div className={className}>
      {children}
    </div>
  )

  const SortableTableBody = ({
    className,
    style,
    children,
  }: SortableBodyProps<T>): ReactElement => (
    <div className={`striped ${className}`} style={{ ...style, overflowY: 'scroll' }}>
      {
        sorted !== null
          ? (
            sorted.map(children)
          )
          : null
      }
    </div>
  )

  const SortableColumn = ({
    column,
    className,
    style,
    children,
  }: SortableColumnProps): ReactElement => {
    const sortIcon = () => {
      if (sortConfig && sortConfig.column === column) {
        if (sortConfig.direction === 'ascending') {
          return <Icon icon="sort-up" />;
        }

        return <Icon icon="sort-down" />;
      }

      return <Icon icon="sort" style={{ color: 'darkgray' }} />;
    }

    return (
      <div className={className} style={style} onClick={() => processTitleClick(column)}>
        {children}
        {sortIcon()}
      </div>
    )
  }

  SortableTable.Column = SortableColumn;
  SortableTable.Header = SortableTableHeader;
  SortableTable.Body = SortableTableBody;

  return {
    setData,
    SortableTable,
  }
}
