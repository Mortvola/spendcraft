import { DateTime } from 'luxon';
import React from 'react';
import styles from './MonthSelector.module.scss';

interface MonthPropsType {
  month: string,
  monthId: number,
  onClick: (monthId: number) => void,
}

const Month: React.FC<MonthPropsType> = ({ month, monthId, onClick }) => {
  const handleClick: React.MouseEventHandler<HTMLDivElement> = (event) => {
    event.stopPropagation();

    onClick(monthId);
  };

  return <div onClick={handleClick}>{month}</div>;
};

interface DropDownPropsType {
  initialValue?: string,
  onSelect: (value: string) => void,
}

const DropDown: React.FC<DropDownPropsType> = ({ initialValue, onSelect }) => {
  const [value, setValue] = React.useState<{ month: number, year: number }>(() => {
    if (initialValue && /\d{1,2}-\d{4}/.test(initialValue)) {
      const [month, year] = initialValue.split('-');
      return { month: parseInt(month, 10), year: parseInt(year, 10) };
    }

    const n = DateTime.now();
    return {
      month: n.month,
      year: n.year,
    };
  });

  const handleDropDownClick: React.MouseEventHandler<HTMLDivElement> = (event) => {
    event.stopPropagation();
  }

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const handleDecrementClick = () => {
    setValue((prev) => ({
      month: prev.month,
      year: prev.year - 1,
    }));
  };

  const handleIncrementClick = () => {
    setValue((prev) => ({
      month: prev.month,
      year: prev.year + 1,
    }));
  };

  const handleMonthClick = (monthId: number) => {
    setValue({
      month: monthId + 1,
      year: value.year,
    });

    onSelect(`${monthId + 1}-${value.year}`);
  };

  return (
    <div className={styles.dropDown} onClick={handleDropDownClick}>
      <div className={styles.year}>
        <div onClick={handleDecrementClick}>&lt;</div>
        <div>{value.year}</div>
        <div onClick={handleIncrementClick}>&gt;</div>
      </div>
      <div className={styles.months}>
        {
          months.map((m, index) => (
            <Month key={m} onClick={handleMonthClick} month={m} monthId={index} />
          ))
        }
      </div>
    </div>
  );
};

interface PropsType {
  value?: string,
  onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void,
}

const MonthSelector: React.FC<PropsType> = ({
  value,
  onChange,
}) => {
  const [open, setOpen] = React.useState<boolean>(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleClick: React.MouseEventHandler<HTMLDivElement> = (event) => {
    event.stopPropagation();
    setOpen(true);
  };

  const handleSelect = (v: string) => {
    const input = inputRef.current;
    if (input) {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      nativeInputValueSetter?.call(input, v);
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }
    setOpen(false);
  };

  const handleMonthDecrement = () => {
    if (value && /\d{1,2}-\d{4}/.test(value)) {
      const input = inputRef.current;
      if (input) {
        const [monthStr, yearStr] = value.split('-');
        let month = parseInt(monthStr, 10);
        let year = parseInt(yearStr, 10);

        month -= 1;
        if (month < 1) {
          year -= 1;
          month = 12;
        }

        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        nativeInputValueSetter?.call(input, `${month}-${year}`);
        input.dispatchEvent(new Event('input', { bubbles: true }))
      }
    }
    setOpen(false);
  }

  const handleMonthIncrement = () => {
    if (value && /\d{1,2}-\d{4}/.test(value)) {
      const input = inputRef.current;
      if (input) {
        const [monthStr, yearStr] = value.split('-');
        let month = parseInt(monthStr, 10);
        let year = parseInt(yearStr, 10);

        month += 1;
        if (month > 12) {
          year += 1;
          month = 1;
        }

        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        nativeInputValueSetter?.call(input, `${month}-${year}`);
        input.dispatchEvent(new Event('input', { bubbles: true }))
      }
    }
    setOpen(false);
  }

  const handleChange: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    if (onChange) {
      onChange(event);
    }
  }

  return (
    <div className={styles.controlWrapper}>
      <button type="button" onClick={handleMonthDecrement}>&lt;</button>
      <div className={styles.control} onClick={handleClick}>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleChange}
          style={{ width: '6rem', textAlign: 'center' }}
        />
        {
          open
            ? (
              <DropDown initialValue={value} onSelect={handleSelect} />
            )
            : null
        }
      </div>
      <button type="button" onClick={handleMonthIncrement}>&gt;</button>
    </div>
  );
};

export default MonthSelector;
