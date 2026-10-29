import React from 'react';
import MoneyCentsAmount from '../MoneyCentsAmount';
import Date from '../Date';
import { BillInterface } from '../State/Types';
import styles from './Bill.module.scss';
import { useCategoryDialog } from '../Categories/CategoryView/CategoryDialog';
import { observer } from 'mobx-react-lite';

interface PropsType {
  bill: BillInterface,
}

const Bill: React.FC<PropsType> = observer(({
  bill,
}) => {
  const [CategoryDialog, showCategoryDialog] = useCategoryDialog();
  
  return (
    <>
      <div key={bill.category.id} className={styles.layout}>
        <div className={`${styles.name} ellipsis`} onClick={showCategoryDialog}>{bill.category
          .name}</div>
        <MoneyCentsAmount amount={bill.category.fundingAmountCents} />
        <Date date={bill.category.computedGoalDate()} />
        {bill.debitsCents === null
          ? <div className="dollar-amount" />
          : <MoneyCentsAmount amount={bill.debitsCents} />}
      </div>
      <CategoryDialog category={bill.category} />
    </>
  )
})

export default Bill;
