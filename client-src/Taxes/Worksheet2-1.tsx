import React from "react"
import Taxes from "../State/Taxes/Taxes";
import AmountInput from "../AmountInput";
import style from './TaxDetails.module.scss';
import { runInAction } from "mobx";
import { observer } from "mobx-react-lite";
import Amount from "../Amount";

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
        Prior Year Adjusted Gross Income:
      </label>
      <AmountInput value={taxes.worksheet2_1.priorYearAgi} onChange={handlePriorYearAGI} />

      <label>
        Prior Year Total Tax:
      </label>
      <AmountInput value={taxes.worksheet2_1.priorYearTotalTax} onChange={handlePriorYearTotalTax} />

      <label>
        1. Expected Adjusted Gross Income:
      </label>
      <AmountInput value={taxes.worksheet2_1.expectedAgi} onChange={handleExpectedAGI} />

        <label>
          2a. Deductions:
        </label>
        <Amount amount={taxes.worksheet2_1.result?.lines['2a']} />

        <label>
          2b. Qualified business income deduction:
        </label>
        <Amount amount={taxes.worksheet2_1.result?.lines['2b']} />

        <label>
          2c. Additional deductions from Schedule 1-A:
        </label>
        <Amount amount={taxes.worksheet2_1.result?.lines['2c']} />

        <label>
          2d. Add lines 2a, 2b, and 2c:
        </label>
        <Amount amount={taxes.worksheet2_1.result?.lines['2d']} />

        <label>
          3. Subtract line 2d from line 1:
        </label>
        <Amount amount={taxes.worksheet2_1.result?.lines['3']} />

        <label>
          4. Tax. Figure your tax on the amount on line 3 by using the Tax Rate Schedules:
        </label>
        <Amount amount={taxes.worksheet2_1.result?.lines['4']} />

        <label>
          5. Alternative minimum tax from Form 6251:
        </label>
        <Amount amount={taxes.worksheet2_1.result?.lines['5']} />

        <label>
          6. Add lines 4 and 5:
        </label>
        <Amount amount={taxes.worksheet2_1.result?.lines['6']} />

        <label>
          7. Credits:
        </label>
        <Amount amount={taxes.worksheet2_1.result?.lines['7']} />

        <label>
          8. Subtract line 7 from line 6. If zero or less, enter -0-:
        </label>
        <Amount amount={taxes.worksheet2_1.result?.lines['8']} />

        <label>
          9. Self-employment tax:
        </label>
        <Amount amount={taxes.worksheet2_1.result?.lines['9']} />

        <label>
          10. Other taxes including, if applicable, Additional Medicare Tax and/or NIIT:
        </label>
        <Amount amount={taxes.worksheet2_1.result?.lines['10']} />

        <label>
          11a. Add lines 8 through 10:
        </label>
        <Amount amount={taxes.worksheet2_1.result?.lines['11a']} />

        <label>
          11b. Credits:
        </label>
        <Amount amount={taxes.worksheet2_1.result?.lines['11b']} />

        <label>
          11c. Total estimated tax. Subtract line 11b from line 11a. If zero or less, enter -0-:
        </label>
        <Amount amount={taxes.worksheet2_1.result?.lines['11c']} />

        <label>
          12a. Multiply line 11c by 90% (0.90) (662/3% (0.6667) for farming and fishing):
        </label>
        <Amount amount={taxes.worksheet2_1.result?.lines['12a']} />

        <label>
          12b. Required annual payment based on prior year’s tax (see instructions):
        </label>
        <Amount amount={taxes.worksheet2_1.result?.lines['12b']} />

        <label>
          12c. Required annual payment to avoid a penalty. Enter the smaller of line 12a or 12b:
        </label>
        <Amount amount={taxes.worksheet2_1.result?.lines['12c']} />

        <label>
          13. Income tax withheld and estimated to be withheld:
        </label>
        <Amount amount={taxes.worksheet2_1.result?.lines['13']} />

        <label>
          14a. Subtract line 13 from line 12c:
        </label>
        <Amount amount={taxes.worksheet2_1.result?.lines['14a']} />

        <label>
          14b. Subtract line 13 from line 11c:
        </label>
        <Amount amount={taxes.worksheet2_1.result?.lines['14b']} />

        <label>
          15. Required tax payment:
        </label>
        <Amount amount={taxes.worksheet2_1.result?.lines['15']} />
    </div>
  )
})

export default Worksheet2_1;
