import { DateTime } from 'luxon';
import React from 'react';

interface PropsType {
  date: DateTime,
  onUpdate: (date: string) => void,
}

const StatementDate: React.FC<PropsType> = ({
  date,
  onUpdate,
}) => {
  const [editDate, setEditDate] = React.useState<boolean>(false)
  const [dateValue, setDateValue] = React.useState<string>('')

  const handleEditDateClick = () => {
    setEditDate(true)
    setDateValue(date.toISODate() ?? '')
  }

  const handleDateChange: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    setDateValue(event.target.value)
  }

  const handleDateKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (event) => {
    if (event.code === 'Enter') {
      setEditDate(false)

      if (dateValue !== date.toISODate()) {
        onUpdate(dateValue)
      }
    }
    else if (event.code === 'Escape') {
      setEditDate(false)
    }
  }

  return (
    // eslint-disable-next-line react/jsx-no-useless-fragment
    <>
      {
        editDate
          ? (
            <input
              type="date"
              value={dateValue}
              onChange={handleDateChange}
              onKeyDown={handleDateKeyDown}
            />
          )
          : <div onClick={handleEditDateClick}>{date.toISODate()}</div>
      }
    </>
  )
}

export default StatementDate;
