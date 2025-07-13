import React from 'react';
import style from './ReportList.module.scss';
import ReportListItem from './ReportListItem';

interface ReportType {
  name: string,
  value: string,
}

interface PropsType {
  reports: ReportType[],
  onSelect: (value: string) => void,
  selectedValue?: string | null,
}

const ReportList: React.FC<PropsType> = ({
  reports,
  onSelect,
  selectedValue = '',
}) => {
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
