import React from 'react'
import { runInAction } from 'mobx'
import { observer } from 'mobx-react-lite'
import AmountInput from '../AmountInput'
import Taxes from '../State/Taxes'
import style from './TaxDetails.module.scss'
import Amount from '../Amount'

interface PropsType {
  taxes: Taxes
}

const CapitalGains: React.FC<PropsType> = observer(({
  taxes,
}) => {
  const handleShorttermCapitalGains: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    runInAction(() => {
      taxes.shortTermCapitalGains = parseFloat(event.target.value);
    })
  }

  const handleLongtermCapitalGains: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    runInAction(() => {
      taxes.longTermCapitalGains = parseFloat(event.target.value);
    })
  }

  return (
    <div className={`${style.capitalGains} ${style.block}`}>
      <label>
        Short-term Capital Gains:
      </label>
      <AmountInput value={taxes.shortTermCapitalGains} onChange={handleShorttermCapitalGains} />
      <Amount amount={taxes.actualShortTermCapitalGains} />

      <label>
        Long-term Capital Gains:
      </label>
      <AmountInput value={taxes.longTermCapitalGains} onChange={handleLongtermCapitalGains} />
      <Amount amount={taxes.actualLongTermCapitalGains} />
    </div>
  )
})

export default CapitalGains;
