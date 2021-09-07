import React, {
  CSSProperties,
  ReactElement, ReactNode, useMemo, useState,
} from 'react';
import Icon from '../Icon';

type SortConfig = {
  column: string,
  direction: 'ascending' | 'descending',
}

type SortableTableHeaderProps = {
  className?: string,
  children?: ReactNode,
}

type SortableColumnProps = {
  column: string,
  className?: string,
  style?: CSSProperties,
  children?: ReactNode,
}

type SortableTableProps<T>= {
  className?: string,
  style?: CSSProperties,
  children: (r: T) => void,
}

type UseSortableTableType<T> = {
  setData: (data: (T & Record<string, unknown>)[]) => void,
  SortableTable: {
    (props: SortableTableProps<T>): ReactElement,
    Header: (props: SortableTableHeaderProps) => ReactElement,
    Column: (props: SortableColumnProps) => ReactElement,
  }
}

export default function useSortableTable<T>(): UseSortableTableType<T> {
  const [data, setData] = useState<(T & Record<string, unknown>)[]>([]);
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);

  const sorted = useMemo(() => {
    const sortedData = data.slice();
    if (sortConfig !== null && sortedData !== null) {
      sortedData.sort((a, b) => {
        const x = a[sortConfig.column];
        const y = b[sortConfig.column];
        if (typeof x === 'number' && typeof y === 'number') {
          return sortConfig.direction === 'ascending' ? x - y : y - x;
        }

        if (typeof x === 'string' && typeof y === 'string') {
          if (sortConfig.direction === 'ascending') {
            return x.localeCompare(y)
          }

          return y.localeCompare(x)
        }

        return 0;
      });
    }

    return sortedData;
  }, [data, sortConfig]);

  const processTitleClick = (column: string) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig !== null && column === sortConfig.column) {
      direction = sortConfig.direction === 'ascending' ? 'descending' : 'ascending';
    }

    setSortConfig({ column, direction });
  }

  const SortableTableHeader = ({
    className,
    children,
  }: SortableTableHeaderProps): ReactElement => (
    <div className={className}>
      {children}
    </div>
  )

  const SortableTable = ({
    className,
    style,
    children,
  }: SortableTableProps<T>): ReactElement => (
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
          return <Icon icon="caret-up" />;
        }

        return <Icon icon="caret-down" />;
      }

      return null;
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

  return {
    setData,
    SortableTable,
  }
}
