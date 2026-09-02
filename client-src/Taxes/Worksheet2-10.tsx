import React from "react"
import Taxes from "../State/Taxes/Taxes";
import style from './TaxDetails.module.scss';
import { observer } from "mobx-react-lite";
import Amount from "../Amount";

interface PropsType {
  taxes: Taxes
}

const Worksheet2_10: React.FC<PropsType> = observer(({
  taxes,
}) => {
  const worksheet2_9 = taxes.worksheet2_9

  return (
    <>
      <div className={`${style.worksheet2_9} ${style.block}`}>
        <label>
          1. Taxable Income:
        </label>
        {
          worksheet2_9.map((period) => (
            <Amount amount={period.worksheet2_10.lines['1']} />
          ))
        }

        <label>
          2. Expected annulized qualified dividends:
        </label>
        {
          worksheet2_9.map((period) => (
            <Amount amount={period.worksheet2_10.lines['2']} />
          ))
        }

        <label>
          3. Expected annualized net capital gain or loss:
        </label>
        {
          worksheet2_9.map((period) => (
            <Amount amount={period.worksheet2_10.lines['3']} />
          ))
        }

        <label>
          4. Add lines 2 and 3:
        </label>
        {
          worksheet2_9.map((period) => (
            <Amount amount={period.worksheet2_10.lines['4']} />
          ))
        }

        <label>
          5. Expected annualized 28% rate gain or loss:
        </label>
        {
          worksheet2_9.map((period) => (
            <Amount amount={period.worksheet2_10.lines['5']} />
          ))
        }

        <label>
          6. Expected unnaulized unrecaptured section 1260 gain:
        </label>
        {
          worksheet2_9.map((period) => (
            <Amount amount={period.worksheet2_10.lines['6']} />
          ))
        }

        <label>
          7. Add lines 5 and 6:
        </label>
        {
          worksheet2_9.map((period) => (
            <Amount amount={period.worksheet2_10.lines['7']} />
          ))
        }

        <label>
          8. Enter the smaller of line 3 or line 7:
        </label>
        {
          worksheet2_9.map((period) => (
            <Amount amount={period.worksheet2_10.lines['8']} />
          ))
        }

        <label>
          9. Subtract line 8 from line 4:
        </label>
        {
          worksheet2_9.map((period) => (
            <Amount amount={period.worksheet2_10.lines['9']} />
          ))
        }

        <label>
          10. Subtract line 9 from line 1:
        </label>
        {
          worksheet2_9.map((period) => (
            <Amount amount={period.worksheet2_10.lines['10']} />
          ))
        }

        <label style={{ whiteSpace: 'pre' }}>
          11. Enter the smaller of line 1 or $98,900<br />
          ($49,450 if Single or Married filing separately<br />
          or $66,200 if Head of Household)
        </label>
        {
          worksheet2_9.map((period) => (
            <Amount amount={period.worksheet2_10.lines['11']} />
          ))
        }

        <label>
          12. Enter the smaller of line 10 or line 11
        </label>
        {
          worksheet2_9.map((period) => (
            <Amount amount={period.worksheet2_10.lines['12']} />
          ))
        }

        <label>
          13a. Subtract line 4 from line 1:
        </label>
        {
          worksheet2_9.map((period) => (
            <Amount amount={period.worksheet2_10.lines['13a']} />
          ))
        }

        <label>
          13b. 
        </label>
        {
          worksheet2_9.map((period) => (
            <Amount amount={period.worksheet2_10.lines['13b']} />
          ))
        }

        <label>
          13c. Enter the smaller of line 10 or line 13b
        </label>
        {
          worksheet2_9.map((period) => (
            <Amount amount={period.worksheet2_10.lines['13c']} />
          ))
        }

        <label>
          14. Enter the larger of line 13a or 13c:
        </label>
        {
          worksheet2_9.map((period) => (
            <Amount amount={period.worksheet2_10.lines['14']} />
          ))
        }

        <label>
          15. Subtract line 12 from line 11. This is the amount taxed at 0%:
        </label>
        {
          worksheet2_9.map((period) => (
            <Amount amount={period.worksheet2_10.lines['15']} />
          ))
        }

        <label>
          16. Enter the smaller of line 1 or line 9:
        </label>
        {
          worksheet2_9.map((period) => (
            <Amount amount={period.worksheet2_10.lines['16']} />
          ))
        }

        <label>
          17. Enter the amount from line 15. If line 15 is blank, enter -0-:
        </label>
        {
          worksheet2_9.map((period) => (
            <Amount amount={period.worksheet2_10.lines['17']} />
          ))
        }

        <label>
          18. Subtract line 17 from line 16. If zero or less, enter -0-:
        </label>
        {
          worksheet2_9.map((period) => (
            <Amount amount={period.worksheet2_10.lines['18']} />
          ))
        }

        <label>
          19.
        </label>
        {
          worksheet2_9.map((period) => (
            <Amount amount={period.worksheet2_10.lines['19']} />
          ))
        }

        <label>
          20. Enter the smaller of line 1 or line 19:
        </label>
        {
          worksheet2_9.map((period) => (
            <Amount amount={period.lines['20']} />
          ))
        }

        <label>
          21. Add lines 14 and 15:
        </label>
        {
          worksheet2_9.map((period) => (
            <Amount amount={period.worksheet2_10.lines['21']} />
          ))
        }

        <label>
          22. Subtract line 21 from line 20. If zero or less, enter -0-:
        </label>
        {
          worksheet2_9.map((period) => (
            <Amount amount={period.worksheet2_10.lines['22'] * 100} />
          ))
        }

        <label>
          23. Enter the smaller of line 18 or line 22:
        </label>
        {
          worksheet2_9.map((period) => (
            <Amount amount={period.worksheet2_10.lines['23']} />
          ))
        }

        <label>
          24. Multiply line 23 by 15% (0.15):
        </label>
        {
          worksheet2_9.map((period) => (
            <Amount amount={period.worksheet2_10.lines['24']} />
          ))
        }

        <label>
          25. Add lines 17 and 23:
        </label>
        {
          worksheet2_9.map((period) => (
            <Amount amount={period.worksheet2_10.lines['25']} />
          ))
        }

        <label>
          26. Subtract line 25 from line 16:
        </label>
        {
          worksheet2_9.map((period) => (
            <Amount amount={period.worksheet2_10.lines['26']} />
          ))
        }

        <label>
          27. Multiply line 26 by 20% (0.20):
        </label>
        {
          worksheet2_9.map((period) => (
            <Amount amount={period.worksheet2_10.lines['27']} />
          ))
        }

        <label>
          28. Enter the smaller of line 3 or line 6:
        </label>
        {
          worksheet2_9.map((period) => (
            <Amount amount={period.worksheet2_10.lines['28']} />
          ))
        }

        <label>
          29. Add lines 4 and 14:
        </label>
        {
          worksheet2_9.map((period) => (
            <Amount amount={period.worksheet2_10.lines['29']} />
          ))
        }

        <label>
          30. Enter the amount from line 1 above:
        </label>
        {
          worksheet2_9.map((period) => (
            <Amount amount={period.worksheet2_10.lines['30']} />
          ))
        }

        <label>
          31. Subtract line 30 from line 29. If zero or less, enter -0-:
        </label>
        {
          worksheet2_9.map((period) => (
            <Amount amount={period.worksheet2_10.lines['31']} />
          ))
        }

        <label>
          32. Subtract line 31 from line 28. If zero or less, enter -0-:
        </label>
        {
          worksheet2_9.map((period) => (
            <Amount amount={period.worksheet2_10.lines['32']} />
          ))
        }

        <label>
          33. Multiply line 32 by 25% (0.25):
        </label>
        {
          worksheet2_9.map((period) => (
            <Amount amount={period.worksheet2_10.lines['33']} />
          ))
        }

        <label>
          34. Add lines 14, 15, 23, 26, and 32:
        </label>
        {
          worksheet2_9.map((period) => (
            <Amount amount={period.worksheet2_10.lines['34']} />
          ))
        }

        <label>
          35. Subtract line 34 from line 1:
        </label>
        {
          worksheet2_9.map((period) => (
            <Amount amount={period.worksheet2_10.lines['35']} />
          ))
        }

        <label>
          36. Multiply line 35 by 28% (0.28):
        </label>
        {
          worksheet2_9.map((period) => (
            <Amount amount={period.worksheet2_10.lines['36']} />
          ))
        }

        <label>
          37. Figure the tax on the amount on line 14 from the Tax Rate Schedules:
        </label>
        {
          worksheet2_9.map((period) => (
            <Amount amount={period.worksheet2_10.lines['37']} />
          ))
        }

        <label>
          38. Add lines 24, 27, 33, 36, and 37:
        </label>
        {
          worksheet2_9.map((period) => (
            <Amount amount={period.worksheet2_10.lines['38']} />
          ))
        }

        <label>
          39. Figure the tax on the amount on line 1 from the Tax Rate Schedules:
        </label>
        {
          worksheet2_9.map((period) => (
            <Amount amount={period.worksheet2_10.lines['39']} />
          ))
        }

        <label>
          40. Tax on all taxable income (including capital gains and qualified dividends):
        </label>
        {
          worksheet2_9.map((period) => (
            <Amount amount={period.worksheet2_10.lines['40']} />
          ))
        }
      </div>
    </>
  )
})

export default Worksheet2_10;
