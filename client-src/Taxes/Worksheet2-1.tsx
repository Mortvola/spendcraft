import React from "react"
import Taxes from "../State/Taxes/Taxes";
import AmountInput from "../AmountInput";
import style from './TaxDetails.module.scss';
import { runInAction } from "mobx";
import { observer } from "mobx-react-lite";

interface PropsType {
  taxes: Taxes
}

const Worksheet2_1: React.FC<PropsType> = observer(({
  taxes,
}) => {
  const handleExpectedAGI: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    runInAction(() => {
      taxes.worksheet2_1.expectedAgi = parseFloat(event.target.value);
    })
  }

  const handlePriorYearAGI: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    runInAction(() => {
      taxes.worksheet2_1.priorYearAgi = parseFloat(event.target.value);
    })
  }

  const handlePriorYearTotalTax: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    runInAction(() => {
      taxes.worksheet2_1.priorYearTotalTax = parseFloat(event.target.value);
    })
  }

  return (
    <div className={`${style.worksheet2_1} ${style.block}`}>
      <label>
        Expected Adjusted Gross Income:
      </label>
      <AmountInput value={taxes.worksheet2_1.expectedAgi} onChange={handleExpectedAGI} />

      <label>
        Prior Year Adjusted Gross Income:
      </label>
      <AmountInput value={taxes.worksheet2_1.priorYearAgi} onChange={handlePriorYearAGI} />

      <label>
        Prior Year Total Tax:
      </label>
      <AmountInput value={taxes.worksheet2_1.priorYearTotalTax} onChange={handlePriorYearTotalTax} />
    </div>
  )
})

export default Worksheet2_1;
