import React from "react"
import Taxes from "../State/Taxes/Taxes";
import style from './TaxDetails.module.scss';
import { observer } from "mobx-react-lite";
import Amount from "../Amount";

interface PropsType {
  taxes: Taxes
}

const Worksheet2_9: React.FC<PropsType> = observer(({
  taxes,
}) => {
  const worksheet2_9 = taxes.worksheet2_9.result

  if (worksheet2_9 === null) {
    return null; 
  }

  return (
    <>
      <div className={`${style.worksheet2_9} ${style.block}`}>
        <label>
          1. Adjusted Gross Income:
        </label>
        {
          worksheet2_9.map((period) => (
            <Amount amount={period.lines['1']} />
          ))
        }

        <label>
          2. Annualization Amounts:
        </label>
        {
          worksheet2_9.map((period) => (
            <Amount amount={period.lines['2']} />
          ))
        }

        <label>
          3. Annualized Income:
        </label>
        {
          worksheet2_9.map((period) => (
            <Amount amount={period.lines['3']} />
          ))
        }

        <label>
          4. Itemized Deductions:
        </label>
        {
          worksheet2_9.map((period) => (
            <Amount amount={period.lines['4']} />
          ))
        }

        <label>
          5. Annualization Amounts:
        </label>
        {
          worksheet2_9.map((period) => (
            <Amount amount={period.lines['5']} />
          ))
        }

        <label>
          6. Multiply line 4 by line 5:
        </label>
        {
          worksheet2_9.map((period) => (
            <Amount amount={period.lines['6']} />
          ))
        }

        <label>
          7. Standard Deduction:
        </label>
        {
          worksheet2_9.map((period) => (
            <Amount amount={period.lines['7']} />
          ))
        }

        <label>
          8. Enter the larger of line 6 or line 7:
        </label>
        {
          worksheet2_9.map((period) => (
            <Amount amount={period.lines['8']} />
          ))
        }

        <label>
          9a. Deduction of qualified business income:
        </label>
        {
          worksheet2_9.map((period) => (
            <Amount amount={period.lines['9a']} />
          ))
        }



        <label>
          9b. Additional deductions from Schedule 1-A (Form 1040), line 38:
        </label>
        {
          worksheet2_9.map((period) => (
            <Amount amount={period.lines['9b']} />
          ))
        }

        <label>
          10. Add lines 8, 9a and 9b:
        </label>
        {
          worksheet2_9.map((period) => (
            <Amount amount={period.lines['10']} />
          ))
        }

        <label>
          11. Subtract line 10 from line 3.
        </label>
        {
          worksheet2_9.map((period) => (
            <Amount amount={period.lines['11']} />
          ))
        }

        <label>
          12. Tax:
        </label>
        {
          worksheet2_9.map((period) => (
            <Amount amount={period.lines['12']} />
          ))
        }

        <label>
          13. Tax from forms 8814, 4972, and 6251:
        </label>
        {
          worksheet2_9.map((period) => (
            <Amount amount={period.lines['13']} />
          ))
        }

        <label>
          14. Add lines 12 and 13:
        </label>
        {
          worksheet2_9.map((period) => (
            <Amount amount={period.lines['14']} />
          ))
        }

        <label>
          15. Non-refundable credits:
        </label>
        {
          worksheet2_9.map((period) => (
            <Amount amount={period.lines['15']} />
          ))
        }

        <label>
          16. Subtract line 15 from 14:
        </label>
        {
          worksheet2_9.map((period) => (
            <Amount amount={period.lines['16']} />
          ))
        }

        <label>
          17. Self-employment tax:
        </label>
        {
          worksheet2_9.map((period) => (
            <Amount amount={period.lines['17']} />
          ))
        }

        <label>
          18. Other taxes:
        </label>
        {
          worksheet2_9.map((period) => (
            <Amount amount={period.lines['18']} />
          ))
        }

        <label>
          19. Total tax:
        </label>
        {
          worksheet2_9.map((period) => (
            <Amount amount={period.lines['19']} />
          ))
        }

        <label>
          20. Refundable credits:
        </label>
        {
          worksheet2_9.map((period) => (
            <Amount amount={period.lines['20']} />
          ))
        }

        <label>
          21. Subtract line 20 from line 19:
        </label>
        {
          worksheet2_9.map((period) => (
            <Amount amount={period.lines['21']} />
          ))
        }

        <label>
          22. Applicable percentage:
        </label>
        {
          worksheet2_9.map((period) => (
            <Amount amount={period.lines['22'] * 100} />
          ))
        }

        <label>
          23. Multiply line 21 by line 22:
        </label>
        {
          worksheet2_9.map((period) => (
            <Amount amount={period.lines['23']} />
          ))
        }

        <label>
          24. Enter amount of line 29 from all previous columns:
        </label>
        {
          worksheet2_9.map((period) => (
            <Amount amount={period.lines['24']} />
          ))
        }

        <label>
          25. Annualized Income Installment. Subtract line 24 from line 23:
        </label>
        {
          worksheet2_9.map((period) => (
            <Amount amount={period.lines['25']} />
          ))
        }

        <label>
          26. 25% of line 12c from worksheet 2-1:
        </label>
        {
          worksheet2_9.map((period) => (
            <Amount amount={period.lines['26']} />
          ))
        }

        <label>
          27. Subtract line 29 of the previous column from line 28 of that column:
        </label>
        {
          worksheet2_9.map((period) => (
            <Amount amount={period.lines['27']} />
          ))
        }

        <label>
          28. Add lines 26 and 27:
        </label>
        {
          worksheet2_9.map((period) => (
            <Amount amount={period.lines['28']} />
          ))
        }

        <label>
          29. Enter the smaller of line 25 or line 26:
        </label>
        {
          worksheet2_9.map((period) => (
            <Amount amount={period.lines['29']} />
          ))
        }

        <label>
          30. Total required payments for the period. Add lines 24 and 29:
        </label>
        {
          worksheet2_9.map((period) => (
            <Amount amount={period.lines['30']} />
          ))
        }

        <label>
          31. Tax payments made:
        </label>
        {
          worksheet2_9.map((period) => (
            <Amount amount={period.lines['31']} />
          ))
        }

        <label>
          32. Estimated tax payments required. Subtract line 31 from line 30:
        </label>
        {
          worksheet2_9.map((period) => (
            <Amount amount={period.lines['32']} />
          ))
        }
      </div>
    </>
  )
})

export default Worksheet2_9;
