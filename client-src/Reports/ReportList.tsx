import React, { ReactElement } from 'react';
import style from './ReportList.module.css';
import ReportListItem from './ReportListItem';

type ReportType = {
  name: string,
  value: string,
}

type PropsType = {
  reports: ReportType[],
  onSelect: (value: string) => void,
  selectedValue?: string | null,
}

const ReportList = ({
  reports,
  onSelect,
  selectedValue = '',
}: PropsType): ReactElement => {
  const handleSelect = (value: string) => {
    onSelect(value);
  }

  return (
    <div className={style.reports}>
      {
        reports.map((r) => (
          <ReportListItem
            key={r.value}
            value={r.value}
            selected={selectedValue === r.value}
            onSelect={handleSelect}
          >
            {r.name}
          </ReportListItem>
        ))
      }
    </div>
  );
}

export default ReportList;
