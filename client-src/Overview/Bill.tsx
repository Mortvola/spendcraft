import React from 'react';
import Amount from '../Amount';
import Date from '../Date';
import { BillInterface } from '../State/Types';
import styles from './Bill.module.scss';
import { useCategoryDialog } from '../Categories/CategoryView/CategoryDialog';
import { useStores } from '../State/Store';
import { observer } from 'mobx-react-lite';

interface PropsType {
  bill: BillInterface,
}

const Bill: React.FC<PropsType> = observer(({
  bill,
}) => {
  const { categoryTree } = useStores()
  const [CategoryDialog, showCategoryDialog] = useCategoryDialog();
  
  const category = categoryTree.getCategory(bill.id)

  if (!category) {
    throw new Error(`Category not found for bill id ${bill.id}`)
  }

  return (
    <>
      <div key={bill.id} className={styles.layout}>
        <div className={`${styles.name} ellipsis`} onClick={showCategoryDialog}>{bill.name}</div>
        <Amount amount={bill.amount} />
        <Date date={bill.date} />
        <Amount amount={bill.debits} noValue="" />
      </div>
      <CategoryDialog category={category} />
    </>
  )
})

export default Bill;
